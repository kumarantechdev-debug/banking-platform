import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { jest } from '@jest/globals';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { status } from '@grpc/grpc-js';
import { GrpcExceptionFilter } from './../src/common/grpc-exception.filter.js';
import { AppModule } from './../src/app.module.js';
import { CustomersService } from '../src/customers/customers.service.js';
import { BankingService } from '../src/banking/banking.service.js';
import { StatementsService } from '../src/statements/statements.service.js';

process.env.JWT_SECRET =
  process.env.JWT_SECRET ?? 'e2e-test-secret-that-is-not-for-production';

describe('API Gateway (e2e)', () => {
  let app: INestApplication<App>;
  const createdCustomer = {
    id: 1,
    name: 'Asha',
    mobile: '+14155552671',
    city: 'Austin',
    state: 'Texas',
    status: 'ACTIVE',
  };
  const customers = {
    create: jest.fn().mockResolvedValue(createdCustomer),
    getById: jest.fn().mockResolvedValue(createdCustomer),
    list: jest.fn().mockResolvedValue({
      customers: [createdCustomer],
      total: 1,
      page: 1,
      limit: 10,
    }),
  };
  const banking = {
    createTransfer: jest.fn(),
  };
  const statements = {
    exportCsv: jest.fn().mockResolvedValue({
      fileName: 'statement-9.csv',
      contentType: 'text/csv',
      content: Buffer.from('statement,csv'),
    }),
    exportPdf: jest.fn().mockResolvedValue({
      fileName: 'statement-9.pdf',
      contentType: 'application/pdf',
      content: Buffer.from('%PDF-1.7'),
    }),
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CustomersService)
      .useValue(customers)
      .overrideProvider(BankingService)
      .useValue(banking)
      .overrideProvider(StatementsService)
      .useValue(statements)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new GrpcExceptionFilter());
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Banking API Gateway')
        .setDescription(
          'HTTP API for the Banking Customer and Fund Transfer Platform',
        )
        .setVersion('1.0')
        .addCookieAuth('access_token', { type: 'apiKey' }, 'access_token')
        .build(),
    );
    SwaggerModule.setup('docs', app, document, { useGlobalPrefix: true });
    await app.init();
  });

  it('/api/health (GET)', () => {
    return request(app.getHttpServer()).get('/api/health').expect(200).expect({
      status: 'success',
      service: 'banking-api-gateway',
    });
  });

  it('keeps health public and rejects missing, invalid, and expired JWTs', async () => {
    const expiredToken = await app.get(JwtService).signAsync(
      {
        sub: 1,
        customerId: 1,
        mobile: '+14155552671',
      },
      { expiresIn: -1 },
    );

    await request(app.getHttpServer()).get('/api/health').expect(200);
    await request(app.getHttpServer()).get('/api/customers').expect(401);
    await request(app.getHttpServer())
      .get('/api/customers')
      .set('Cookie', 'access_token=invalid-token')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/customers')
      .set('Cookie', `access_token=${expiredToken}`)
      .expect(401);
  });

  it('protects customer, banking, search, statement, and settlement routes', async () => {
    const paths = [
      '/api/customers',
      '/api/customers/1',
      '/api/search/customers',
      '/api/accounts/1',
      '/api/transfers/1',
      '/api/statements/1',
      '/api/settlements/1',
    ];

    for (const path of paths) {
      await request(app.getHttpServer()).get(path).expect(401);
    }
  });

  it('logs out an authenticated customer by clearing the auth cookie', async () => {
    const token = await app.get(JwtService).signAsync({
      sub: 1,
      customerId: 1,
      mobile: '+14155552671',
    });

    const response = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', `access_token=${token}`)
      .expect(200)
      .expect({ message: 'Logout successful' });

    const logoutCookie = response.headers['set-cookie']?.[0] ?? '';
    expect(logoutCookie).toContain('access_token=;');
    expect(logoutCookie).toContain('Path=/');
    expect(logoutCookie).toContain('HttpOnly');
    expect(logoutCookie).toContain('SameSite=Lax');
    expect(logoutCookie).toContain('Expires=');
  });

  it('rejects logout with missing, invalid, or bearer-header authentication', async () => {
    const token = await app.get(JwtService).signAsync({
      sub: 1,
      customerId: 1,
      mobile: '+14155552671',
    });

    await request(app.getHttpServer()).post('/api/auth/logout').expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', 'access_token=invalid-token')
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('returns a structured HTTP conflict when an idempotency key is reused with different details', async () => {
    const token = await app.get(JwtService).signAsync({
      sub: 1,
      customerId: 1,
      mobile: '+14155552671',
    });
    banking.createTransfer.mockRejectedValueOnce(
      Object.assign(new Error('Idempotency key was already used.'), {
        code: status.ALREADY_EXISTS,
      }),
    );

    await request(app.getHttpServer())
      .post('/api/transfers')
      .set('Cookie', `access_token=${token}`)
      .send({
        fromAccountId: 5,
        toAccountId: 4,
        amount: '3',
        idempotencyKey: 'TRANSFER-TEST-002',
      })
      .expect(409)
      .expect({
        statusCode: 409,
        message: 'Resource already exists',
      });
  });

  it('allows public customer registration without a token', async () => {
    await request(app.getHttpServer())
      .post('/api/customers')
      .send({
        name: 'Asha',
        mobile: '+14155552671',
        city: 'Austin',
        state: 'Texas',
        password: 'Test@12345',
      })
      .expect(201)
      .expect(createdCustomer);

    expect(customers.create).toHaveBeenCalledWith({
      name: 'Asha',
      mobile: '+14155552671',
      city: 'Austin',
      state: 'Texas',
      password: 'Test@12345',
    });
  });

  it('returns structured 400 responses for missing and unknown fields', async () => {
    const token = await app.get(JwtService).signAsync({
      sub: 1,
      customerId: 1,
      mobile: '+14155552671',
    });

    const missingLoginPassword = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ mobile: '+14155552671' })
      .expect(400);
    expect(missingLoginPassword.body).toMatchObject({
      statusCode: 400,
      message: expect.arrayContaining(['password should not be empty']),
    });

    const missingAccountFields = await request(app.getHttpServer())
      .post('/api/accounts')
      .set('Cookie', `access_token=${token}`)
      .send({})
      .expect(400);
    expect(missingAccountFields.body).toMatchObject({
      statusCode: 400,
      message: expect.arrayContaining([
        'customerId must not be less than 1',
        'initialBalance must be a string',
      ]),
    });

    await request(app.getHttpServer())
      .post('/api/accounts')
      .set('Cookie', `access_token=${token}`)
      .send({
        customerId: 1,
        initialBalance: '100.00',
        unexpectedField: true,
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.statusCode).toBe(400);
        expect(body.message).toContain(
          'property unexpectedField should not exist',
        );
      });
  });

  it('returns HTTP 400 for invalid route IDs', async () => {
    const token = await app.get(JwtService).signAsync({
      sub: 1,
      customerId: 1,
      mobile: '+14155552671',
    });

    await request(app.getHttpServer())
      .get('/api/customers/not-a-number')
      .set('Cookie', `access_token=${token}`)
      .expect(400)
      .expect(({ body }) => {
        expect(body.statusCode).toBe(400);
        expect(body.message).toEqual(
          expect.arrayContaining(['id must be an integer number']),
        );
      });
  });

  it('accepts a valid token and reaches the protected endpoint', async () => {
    const token = await app.get(JwtService).signAsync({
      sub: 1,
      customerId: 1,
      mobile: '+14155552671',
    });

    const response = await request(app.getHttpServer())
      .get('/api/customers')
      .set('Cookie', `access_token=${token}`);

    expect(response.status).not.toBe(401);
  });

  it('downloads statement CSV and PDF exports', async () => {
    const token = await app.get(JwtService).signAsync({
      sub: 1,
      customerId: 1,
      mobile: '+14155552671',
    });

    const csv = await request(app.getHttpServer())
      .get('/api/statements/9/export/csv')
      .set('Cookie', `access_token=${token}`)
      .expect(200)
      .expect('Content-Type', /text\/csv/)
      .expect('Content-Disposition', 'attachment; filename="statement-9.csv"');
    expect(csv.text).toBe('statement,csv');
    expect(statements.exportCsv).toHaveBeenCalledWith(9);

    const pdf = await request(app.getHttpServer())
      .get('/api/statements/9/export/pdf')
      .set('Cookie', `access_token=${token}`)
      .expect(200)
      .expect('Content-Type', /application\/pdf/)
      .expect('Content-Disposition', 'attachment; filename="statement-9.pdf"');
    expect(pdf.body).toEqual(Buffer.from('%PDF-1.7'));
    expect(statements.exportPdf).toHaveBeenCalledWith(9);
  });

  it('/api/docs (GET)', () => {
    return request(app.getHttpServer()).get('/api/docs').expect(200);
  });

  it('/api/docs-json documents all gateway endpoints', () => {
    return request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200)
      .expect(({ body }) => {
        expect(Object.keys(body.paths)).toEqual(
          expect.arrayContaining([
            '/api/health',
            '/api/auth/login',
            '/api/auth/logout',
            '/api/customers',
            '/api/customers/{id}',
            '/api/search/customers',
            '/api/accounts',
            '/api/accounts/{id}',
            '/api/transfers',
            '/api/transfers/{id}',
            '/api/statements',
            '/api/statements/{id}',
            '/api/statements/{id}/export/csv',
            '/api/statements/{id}/export/pdf',
            '/api/settlements',
            '/api/settlements/{id}',
            '/api/settlements/{id}/process',
          ]),
        );
        expect(body.components.securitySchemes.access_token).toMatchObject({
          type: 'apiKey',
          in: 'cookie',
          name: 'access_token',
        });
        expect(body.paths['/api/customers'].get.security).toEqual([
          { access_token: [] },
        ]);
        expect(body.paths['/api/customers'].post.security).toBeUndefined();
        expect(body.paths['/api/customers/{id}'].get.security).toEqual([
          { access_token: [] },
        ]);
        expect(body.paths['/api/health'].get.security).toBeUndefined();
        expect(body.paths['/api/auth/login'].post.security).toBeUndefined();
        expect(body.paths['/api/auth/logout'].post.security).toEqual([
          { access_token: [] },
        ]);
        expect(body.paths['/api/statements/{id}/export/csv'].get).toMatchObject(
          {
            responses: {
              '200': {
                content: {
                  'text/csv': {
                    schema: { type: 'string', format: 'binary' },
                  },
                },
              },
            },
          },
        );
        expect(body.paths['/api/statements/{id}/export/pdf'].get).toMatchObject(
          {
            responses: {
              '200': {
                content: {
                  'application/pdf': {
                    schema: { type: 'string', format: 'binary' },
                  },
                },
              },
            },
          },
        );
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
