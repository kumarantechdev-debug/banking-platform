import { status as grpcStatus } from '@grpc/grpc-js';
import { jest } from '@jest/globals';
import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { of, throwError } from 'rxjs';
import { CUSTOMER_GRPC_CLIENT } from '../grpc/grpc-clients.module.js';
import { AuthService } from './auth.service.js';
import type { LoginDto } from './auth.dto.js';

describe('AuthService', () => {
  const credentials: LoginDto = {
    mobile: '+14155552671',
    password: 'Test@12345',
  };
  const verifyCustomerCredentials = jest.fn();
  const signAsync = jest.fn();
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    verifyCustomerCredentials.mockReturnValue(
      of({
        customerId: 7,
        mobile: credentials.mobile,
        status: 'ACTIVE',
        authenticated: true,
      }),
    );
    signAsync.mockResolvedValue('signed-token');

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: CUSTOMER_GRPC_CLIENT,
          useValue: {
            getService: jest.fn().mockReturnValue({ verifyCustomerCredentials }),
          },
        },
        { provide: JwtService, useValue: { signAsync } },
      ],
    }).compile();

    service = module.get(AuthService);
    service.onModuleInit();
  });

  it('verifies credentials through Customer Service and creates a token', async () => {
    await expect(service.login(credentials)).resolves.toEqual({
      accessToken: 'signed-token',
    });
    expect(verifyCustomerCredentials).toHaveBeenCalledWith(credentials);
    expect(signAsync).toHaveBeenCalledWith({
      sub: 7,
      customerId: 7,
      mobile: credentials.mobile,
    });
  });

  it('returns 401 when Customer Service rejects credentials', async () => {
    const error = Object.assign(new Error('Invalid credentials'), {
      code: grpcStatus.UNAUTHENTICATED,
    });
    verifyCustomerCredentials.mockReturnValue(throwError(() => error));

    await expect(service.login(credentials)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(signAsync).not.toHaveBeenCalled();
  });

  it('returns 401 when the authentication result is false', async () => {
    verifyCustomerCredentials.mockReturnValue(
      of({
        customerId: 7,
        mobile: credentials.mobile,
        status: 'ACTIVE',
        authenticated: false,
      }),
    );

    await expect(service.login(credentials)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(signAsync).not.toHaveBeenCalled();
  });
});
