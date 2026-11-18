import { status } from '@grpc/grpc-js';
import bcrypt from 'bcrypt';
import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Customer } from './entities/customer.entity.js';
import { GetCustomersDto } from './dto/get-customers.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';
import { CustomerService } from './customer.service.js';

interface QueryBuilderMock {
  andWhere: jest.Mock<
    (
      condition: string,
      parameters?: Record<string, unknown>,
    ) => QueryBuilderMock
  >;
  orderBy: jest.Mock<
    (column: string, direction: 'ASC' | 'DESC') => QueryBuilderMock
  >;
  skip: jest.Mock<(value: number) => QueryBuilderMock>;
  take: jest.Mock<(value: number) => QueryBuilderMock>;
  getManyAndCount: jest.Mock<() => Promise<[Customer[], number]>>;
}

describe('CustomerService', () => {
  let service: CustomerService;
  const queryBuilder: QueryBuilderMock = {
    andWhere:
      jest.fn<
        (
          condition: string,
          parameters?: Record<string, unknown>,
        ) => QueryBuilderMock
      >(),
    orderBy:
      jest.fn<
        (column: string, direction: 'ASC' | 'DESC') => QueryBuilderMock
      >(),
    skip: jest.fn<(value: number) => QueryBuilderMock>(),
    take: jest.fn<(value: number) => QueryBuilderMock>(),
    getManyAndCount: jest.fn<() => Promise<[Customer[], number]>>(),
  };
  const customerRepository = {
    findOneBy:
      jest.fn<(criteria: Partial<Customer>) => Promise<Customer | null>>(),
    createQueryBuilder: jest.fn<(alias: string) => QueryBuilderMock>(),
    create: jest.fn<(values: Partial<Customer>) => Customer>(),
    save: jest.fn<(customer: Customer) => Promise<Customer>>(),
    delete:
      jest.fn<
        (criteria: { id: number }) => Promise<{ affected?: number | null }>
      >(),
  };

  beforeEach(async () => {
    customerRepository.findOneBy.mockReset().mockResolvedValue(null);
    customerRepository.createQueryBuilder
      .mockReset()
      .mockReturnValue(queryBuilder);
    customerRepository.create
      .mockReset()
      .mockImplementation((values) => Object.assign(new Customer(), values));
    customerRepository.save
      .mockReset()
      .mockImplementation(async (customer) =>
        Object.assign(new Customer(), customer, { id: customer.id || 7 }),
      );
    customerRepository.delete.mockReset().mockResolvedValue({ affected: 1 });

    queryBuilder.andWhere.mockReset().mockReturnValue(queryBuilder);
    queryBuilder.orderBy.mockReset().mockReturnValue(queryBuilder);
    queryBuilder.skip.mockReset().mockReturnValue(queryBuilder);
    queryBuilder.take.mockReset().mockReturnValue(queryBuilder);
    queryBuilder.getManyAndCount.mockReset().mockResolvedValue([[], 0]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerService,
        {
          provide: getRepositoryToken(Customer),
          useValue: customerRepository,
        },
      ],
    }).compile();

    service = module.get(CustomerService);
  });

  it('creates a customer with ACTIVE status', async () => {
    const customer = await service.createCustomer({
      name: 'Ada Lovelace',
      mobile: '+14155552671',
      city: 'London',
      state: 'London',
      password: 'correct horse battery staple',
    });

    const createdValues = customerRepository.create.mock.calls[0][0];
    expect(createdValues).toMatchObject({
      name: 'Ada Lovelace',
      mobile: '+14155552671',
      city: 'London',
      state: 'London',
      status: 'ACTIVE',
    });
    expect(createdValues.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(createdValues.passwordHash).not.toBe('correct horse battery staple');
    await expect(
      bcrypt.compare(
        'correct horse battery staple',
        createdValues.passwordHash!,
      ),
    ).resolves.toBe(true);
    expect(customer.id).toBe(7);
    expect(customer.status).toBe('ACTIVE');
  });

  it('rejects duplicate mobiles before inserting', async () => {
    customerRepository.findOneBy.mockResolvedValue(
      Object.assign(new Customer(), { id: 1 }),
    );

    await expect(
      service.createCustomer({
        name: 'Ada Lovelace',
        mobile: '+14155552671',
        city: 'London',
        state: 'London',
        password: 'correct horse battery staple',
      }),
    ).rejects.toMatchObject({
      error: {
        code: status.ALREADY_EXISTS,
      },
    });
    expect(customerRepository.save).not.toHaveBeenCalled();
  });

  it('maps a concurrent duplicate insert to ALREADY_EXISTS', async () => {
    customerRepository.save.mockRejectedValue(
      Object.assign(new Error('duplicate key'), { code: 'ER_DUP_ENTRY' }),
    );

    await expect(
      service.createCustomer({
        name: 'Ada Lovelace',
        mobile: '+14155552671',
        city: 'London',
        state: 'London',
        password: 'correct horse battery staple',
      }),
    ).rejects.toMatchObject({
      error: { code: status.ALREADY_EXISTS },
    });
  });

  it('returns a customer by ID', async () => {
    const customer = Object.assign(new Customer(), { id: 7 });
    customerRepository.findOneBy.mockResolvedValue(customer);

    await expect(service.getCustomer(7)).resolves.toBe(customer);
    expect(customerRepository.findOneBy).toHaveBeenCalledWith({ id: 7 });
  });

  it('authenticates a customer with valid provisioned credentials', async () => {
    const passwordHash = await bcrypt.hash('correct horse battery staple', 10);
    customerRepository.findOneBy.mockResolvedValue(
      Object.assign(new Customer(), {
        id: 7,
        mobile: '+14155552671',
        status: 'ACTIVE',
        passwordHash,
      }),
    );

    await expect(
      service.verifyCustomerCredentials(
        '+14155552671',
        'correct horse battery staple',
      ),
    ).resolves.toEqual({
      customerId: 7,
      mobile: '+14155552671',
      status: 'ACTIVE',
      authenticated: true,
    });
  });

  it('rejects an incorrect password with a generic authentication error', async () => {
    const passwordHash = await bcrypt.hash('correct horse battery staple', 10);
    customerRepository.findOneBy.mockResolvedValue(
      Object.assign(new Customer(), {
        id: 7,
        mobile: '+14155552671',
        passwordHash,
      }),
    );

    await expect(
      service.verifyCustomerCredentials('+14155552671', 'incorrect'),
    ).rejects.toMatchObject({
      error: {
        code: status.UNAUTHENTICATED,
        message: 'Invalid mobile or password',
      },
    });
  });

  it('rejects customers without provisioned credentials generically', async () => {
    customerRepository.findOneBy.mockResolvedValue(
      Object.assign(new Customer(), {
        id: 7,
        mobile: '+14155552671',
        passwordHash: null,
      }),
    );

    await expect(
      service.verifyCustomerCredentials(
        '+14155552671',
        'correct horse battery staple',
      ),
    ).rejects.toMatchObject({
      error: {
        code: status.UNAUTHENTICATED,
        message: 'Invalid mobile or password',
      },
    });
  });

  it('uses the same generic error when no customer matches the mobile', async () => {
    await expect(
      service.verifyCustomerCredentials('+14155552671', 'incorrect'),
    ).rejects.toMatchObject({
      error: {
        code: status.UNAUTHENTICATED,
        message: 'Invalid mobile or password',
      },
    });
  });

  it('returns NOT_FOUND when the requested customer is missing', async () => {
    await expect(service.getCustomer(404)).rejects.toMatchObject({
      error: { code: status.NOT_FOUND },
    });
  });

  it('uses the default pagination and createdAt sort for an unfiltered query', async () => {
    await expect(service.getCustomers(new GetCustomersDto())).resolves.toEqual({
      customers: [],
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    });

    expect(queryBuilder.andWhere).not.toHaveBeenCalled();
    expect(queryBuilder.orderBy).toHaveBeenCalledWith(
      'customer.createdAt',
      'DESC',
    );
    expect(queryBuilder.skip).toHaveBeenCalledWith(0);
    expect(queryBuilder.take).toHaveBeenCalledWith(10);
  });

  it('combines parameterized filters, inclusive dates, sorting, and pagination', async () => {
    const filters = Object.assign(new GetCustomersDto(), {
      page: 2,
      limit: 5,
      name: 'Ada',
      mobile: '+14%',
      city: 'London',
      state: 'Greater London',
      status: 'ACTIVE',
      fromDate: '2026-01-01',
      toDate: '2026-01-31',
      sortBy: 'name',
      sortOrder: 'ASC',
    });
    const customer = Object.assign(new Customer(), { id: 7 });
    queryBuilder.getManyAndCount.mockResolvedValue([[customer], 11]);

    await expect(service.getCustomers(filters)).resolves.toEqual({
      customers: [customer],
      total: 11,
      page: 2,
      limit: 5,
      totalPages: 3,
    });

    expect(queryBuilder.andWhere).toHaveBeenNthCalledWith(
      1,
      "customer.name LIKE :name ESCAPE '!'",
      { name: 'Ada%' },
    );
    expect(queryBuilder.andWhere).toHaveBeenNthCalledWith(
      2,
      "customer.mobile LIKE :mobile ESCAPE '!'",
      { mobile: '+14!%%' },
    );
    expect(queryBuilder.andWhere).toHaveBeenNthCalledWith(
      6,
      'customer.createdAt >= :fromDate',
      { fromDate: new Date('2026-01-01T00:00:00.000Z') },
    );
    expect(queryBuilder.andWhere).toHaveBeenNthCalledWith(
      7,
      'customer.createdAt < :toDate',
      { toDate: new Date('2026-02-01T00:00:00.000Z') },
    );
    expect(queryBuilder.orderBy).toHaveBeenCalledWith('customer.name', 'ASC');
    expect(queryBuilder.skip).toHaveBeenCalledWith(5);
    expect(queryBuilder.take).toHaveBeenCalledWith(5);
  });

  it.each([
    ['name', 'customer.name LIKE :name ESCAPE \'!\'', 'Ada'],
    ['mobile', 'customer.mobile LIKE :mobile ESCAPE \'!\'', '+1415'],
    ['city', 'customer.city LIKE :city ESCAPE \'!\'', 'London'],
    ['state', 'customer.state LIKE :state ESCAPE \'!\'', 'London'],
  ] as const)(
    'applies the %s filter through the database query',
    async (filter, condition, value) => {
      await service.getCustomers(
        Object.assign(new GetCustomersDto(), { [filter]: value }),
      );

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(condition, {
        [filter]: `${value}%`,
      });
    },
  );

  it.each([
    ['createdAt', 'customer.createdAt'],
    ['name', 'customer.name'],
    ['mobile', 'customer.mobile'],
    ['city', 'customer.city'],
    ['state', 'customer.state'],
    ['status', 'customer.status'],
  ] as const)('sorts by the supported %s column', async (sortBy, column) => {
    await service.getCustomers(
      Object.assign(new GetCustomersDto(), { sortBy, sortOrder: 'ASC' }),
    );

    expect(queryBuilder.orderBy).toHaveBeenCalledWith(column, 'ASC');
  });

  it('applies status and date-only bounds as inclusive calendar days', async () => {
    await service.getCustomers(
      Object.assign(new GetCustomersDto(), {
        status: 'ACTIVE',
        fromDate: '2026-01-01',
        toDate: '2026-01-31',
      }),
    );

    expect(queryBuilder.andWhere).toHaveBeenNthCalledWith(
      1,
      'customer.status = :status',
      { status: 'ACTIVE' },
    );
    expect(queryBuilder.andWhere).toHaveBeenNthCalledWith(
      2,
      'customer.createdAt >= :fromDate',
      { fromDate: new Date('2026-01-01T00:00:00.000Z') },
    );
    expect(queryBuilder.andWhere).toHaveBeenNthCalledWith(
      3,
      'customer.createdAt < :toDate',
      { toDate: new Date('2026-02-01T00:00:00.000Z') },
    );
  });

  it('maps customer query failures to INTERNAL', async () => {
    queryBuilder.getManyAndCount.mockRejectedValue(
      Object.assign(new Error('query failed'), { code: 'ER_BAD_FIELD_ERROR' }),
    );

    await expect(
      service.getCustomers(new GetCustomersDto()),
    ).rejects.toMatchObject({
      error: { code: status.INTERNAL },
    });
  });

  it('updates supplied fields and preserves unspecified customer data', async () => {
    const customer = Object.assign(new Customer(), {
      id: 7,
      name: 'Ada Lovelace',
      mobile: '+14155552671',
      city: 'London',
      state: 'London',
      status: 'ACTIVE',
    });
    customerRepository.findOneBy.mockResolvedValueOnce(customer);
    const updated = await service.updateCustomer(
      Object.assign(new UpdateCustomerDto(), { id: 7, city: 'Oxford' }),
    );

    expect(updated.city).toBe('Oxford');
    expect(updated.name).toBe('Ada Lovelace');
    expect(customerRepository.save).toHaveBeenCalledWith(customer);
  });

  it('rejects updates for a missing customer', async () => {
    await expect(
      service.updateCustomer(
        Object.assign(new UpdateCustomerDto(), { id: 404, city: 'Oxford' }),
      ),
    ).rejects.toMatchObject({
      error: { code: status.NOT_FOUND },
    });
  });

  it('prevents assigning a mobile number owned by another customer', async () => {
    const customer = Object.assign(new Customer(), {
      id: 7,
      mobile: '+14155552671',
    });
    customerRepository.findOneBy
      .mockResolvedValueOnce(customer)
      .mockResolvedValueOnce(Object.assign(new Customer(), { id: 8 }));

    await expect(
      service.updateCustomer(
        Object.assign(new UpdateCustomerDto(), {
          id: 7,
          mobile: '+14155550000',
        }),
      ),
    ).rejects.toMatchObject({
      error: { code: status.ALREADY_EXISTS },
    });
    expect(customerRepository.save).not.toHaveBeenCalled();
  });

  it('maps concurrent mobile updates to ALREADY_EXISTS', async () => {
    const customer = Object.assign(new Customer(), {
      id: 7,
      mobile: '+14155552671',
    });
    customerRepository.findOneBy
      .mockResolvedValueOnce(customer)
      .mockResolvedValueOnce(null);
    customerRepository.save.mockRejectedValue(
      Object.assign(new Error('duplicate key'), { code: 'ER_DUP_ENTRY' }),
    );

    await expect(
      service.updateCustomer(
        Object.assign(new UpdateCustomerDto(), {
          id: 7,
          mobile: '+14155550000',
        }),
      ),
    ).rejects.toMatchObject({
      error: { code: status.ALREADY_EXISTS },
    });
  });

  it('deletes only the requested customer', async () => {
    await expect(service.deleteCustomer(7)).resolves.toEqual({
      success: true,
      message: 'Customer deleted successfully',
    });
    expect(customerRepository.delete).toHaveBeenCalledWith({ id: 7 });
  });

  it('returns NOT_FOUND when no customer was deleted', async () => {
    customerRepository.delete.mockResolvedValue({ affected: 0 });

    await expect(service.deleteCustomer(404)).rejects.toMatchObject({
      error: { code: status.NOT_FOUND },
    });
  });

  it('maps delete database failures to INTERNAL', async () => {
    customerRepository.delete.mockRejectedValue(
      Object.assign(new Error('database failure'), {
        code: 'ER_LOCK_WAIT_TIMEOUT',
      }),
    );

    await expect(service.deleteCustomer(7)).rejects.toMatchObject({
      error: { code: status.INTERNAL },
    });
  });

  it('maps database connection failures to UNAVAILABLE', async () => {
    customerRepository.findOneBy.mockRejectedValue(
      Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' }),
    );

    await expect(service.getCustomer(7)).rejects.toMatchObject({
      error: { code: status.UNAVAILABLE },
    });
  });
});
