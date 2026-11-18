import { status } from '@grpc/grpc-js';
import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { RpcException } from '@nestjs/microservices';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { GetCustomersDto } from './dto/get-customers.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';
import { Customer } from './entities/customer.entity.js';
import { CustomerGrpcController } from './customer.grpc.controller.js';
import { CustomerService } from './customer.service.js';

describe('CustomerGrpcController', () => {
  let controller: CustomerGrpcController;
  const customerService = {
    createCustomer: jest.fn<(dto: CreateCustomerDto) => Promise<Customer>>(),
    getCustomer: jest.fn<(id: number) => Promise<Customer>>(),
    getCustomers: jest.fn<
      (dto: GetCustomersDto) => Promise<{
        customers: Customer[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>
    >(),
    verifyCustomerCredentials: jest.fn<
      (
        mobile: string,
        password: string,
      ) => Promise<{
        customerId: number;
        mobile: string;
        status: 'ACTIVE' | 'INACTIVE';
        authenticated: true;
      }>
    >(),
    updateCustomer: jest.fn<(dto: UpdateCustomerDto) => Promise<Customer>>(),
    deleteCustomer:
      jest.fn<(id: number) => Promise<{ success: boolean; message: string }>>(),
  };

  beforeEach(async () => {
    customerService.createCustomer.mockReset();
    customerService.getCustomer.mockReset();
    customerService.getCustomers.mockReset();
    customerService.verifyCustomerCredentials.mockReset();
    customerService.updateCustomer.mockReset();
    customerService.deleteCustomer.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomerGrpcController],
      providers: [{ provide: CustomerService, useValue: customerService }],
    }).compile();

    controller = module.get(CustomerGrpcController);
  });

  it('rejects invalid create input before calling the service', async () => {
    await expect(
      controller.createCustomer({
        name: ' ',
        mobile: 'invalid',
        city: '',
        state: '',
      }),
    ).rejects.toMatchObject({
      error: { code: status.INVALID_ARGUMENT },
    });
    expect(customerService.createCustomer).not.toHaveBeenCalled();
  });

  it('returns created customer details', async () => {
    const request = {
      name: 'Ada Lovelace',
      mobile: '+14155552671',
      city: 'London',
      state: 'London',
      password: 'correct horse battery staple',
    };
    const customer = makeCustomer({
      ...request,
      passwordHash: '$2b$10$redactedhash',
    });
    customerService.createCustomer.mockResolvedValue(customer);

    await expect(controller.createCustomer(request)).resolves.toEqual(
      customerResponse(customer),
    );
  });

  it('validates and maps GetCustomer requests', async () => {
    const customer = makeCustomer({ id: 7 });
    customerService.getCustomer.mockResolvedValue(customer);

    await expect(controller.getCustomer({ id: 7 })).resolves.toEqual(
      customerResponse(customer),
    );
    expect(customerService.getCustomer).toHaveBeenCalledWith(7);
    await expect(controller.getCustomer({ id: 0 })).rejects.toMatchObject({
      error: { code: status.INVALID_ARGUMENT },
    });
  });

  it('validates credential requests and returns only authentication details', async () => {
    customerService.verifyCustomerCredentials.mockResolvedValue({
      customerId: 7,
      mobile: '+14155552671',
      status: 'ACTIVE',
      authenticated: true,
    });

    await expect(
      controller.verifyCustomerCredentials({
        mobile: '+14155552671',
        password: 'correct horse battery staple',
      }),
    ).resolves.toEqual({
      customerId: 7,
      mobile: '+14155552671',
      status: 'ACTIVE',
      authenticated: true,
    });
    expect(customerService.verifyCustomerCredentials).toHaveBeenCalledWith(
      '+14155552671',
      'correct horse battery staple',
    );
    await expect(
      controller.verifyCustomerCredentials({ mobile: '+14155552671' }),
    ).rejects.toMatchObject({
      error: { code: status.INVALID_ARGUMENT },
    });
  });

  it('rejects invalid GetCustomers filters', async () => {
    await expect(
      controller.getCustomers({ page: 1, limit: 101 }),
    ).rejects.toMatchObject({
      error: { code: status.INVALID_ARGUMENT },
    });
    await expect(
      controller.getCustomers({
        page: 1,
        limit: 10,
        fromDate: '2026-02-01',
        toDate: '2026-01-01',
      }),
    ).rejects.toMatchObject({
      error: { code: status.INVALID_ARGUMENT },
    });
    expect(customerService.getCustomers).not.toHaveBeenCalled();
  });

  it('treats a date-only toDate as the full day', async () => {
    customerService.getCustomers.mockResolvedValue({
      customers: [],
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    });

    await expect(
      controller.getCustomers({
        page: 1,
        limit: 10,
        fromDate: '2026-01-31T12:00:00Z',
        toDate: '2026-01-31',
      }),
    ).resolves.toMatchObject({ total: 0 });
  });

  it('returns filtered and paginated customer details', async () => {
    const customer = makeCustomer({ id: 7 });
    customerService.getCustomers.mockResolvedValue({
      customers: [customer],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    });

    await expect(
      controller.getCustomers({
        city: 'London',
        sortBy: 'name',
        sortOrder: 'ASC',
      }),
    ).resolves.toEqual({
      customers: [customerResponse(customer)],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    });
    expect(customerService.getCustomers).toHaveBeenCalledWith(
      expect.objectContaining({ city: 'London', sortBy: 'name' }),
    );
  });

  it('converts numeric query strings and applies pagination defaults', async () => {
    customerService.getCustomers.mockResolvedValue({
      customers: [],
      total: 0,
      page: 2,
      limit: 3,
      totalPages: 0,
    });

    await controller.getCustomers({ page: '2', limit: '3' });

    expect(customerService.getCustomers).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, limit: 3 }),
    );
    await controller.getCustomers({});
    expect(customerService.getCustomers).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, limit: 10 }),
    );
  });

  it.each([
    { page: 0 },
    { page: 1.5 },
    { page: 'invalid' },
    { limit: 0 },
    { limit: 101 },
    { fromDate: '2026-02-30' },
    { toDate: 'not-a-date' },
    { sortBy: 'passwordHash' },
    { sortBy: 'createdAt; DROP TABLE customers' },
    { sortOrder: 'sideways' },
  ])('rejects invalid customer-list parameters: %o', async (request) => {
    await expect(controller.getCustomers(request)).rejects.toMatchObject({
      error: { code: status.INVALID_ARGUMENT },
    });
    expect(customerService.getCustomers).not.toHaveBeenCalled();
  });

  it('rejects an update without fields or with an invalid status', async () => {
    await expect(controller.updateCustomer({ id: 7 })).rejects.toBeInstanceOf(
      RpcException,
    );
    await expect(
      controller.updateCustomer({ id: 7, status: 'SUSPENDED' }),
    ).rejects.toMatchObject({
      error: { code: status.INVALID_ARGUMENT },
    });
    expect(customerService.updateCustomer).not.toHaveBeenCalled();
  });

  it('returns updated customer details', async () => {
    const customer = makeCustomer({ id: 7, city: 'Oxford' });
    customerService.updateCustomer.mockResolvedValue(customer);

    await expect(
      controller.updateCustomer({ id: 7, city: 'Oxford' }),
    ).resolves.toEqual(customerResponse(customer));
    expect(customerService.updateCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7, city: 'Oxford' }),
    );
  });

  it('validates and maps DeleteCustomer requests', async () => {
    customerService.deleteCustomer.mockResolvedValue({
      success: true,
      message: 'Customer deleted successfully',
    });

    await expect(controller.deleteCustomer({ id: 7 })).resolves.toEqual({
      success: true,
      message: 'Customer deleted successfully',
    });
    expect(customerService.deleteCustomer).toHaveBeenCalledWith(7);
    await expect(controller.deleteCustomer({ id: 0 })).rejects.toMatchObject({
      error: { code: status.INVALID_ARGUMENT },
    });
  });
});

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return Object.assign(
    new Customer(),
    {
      id: 7,
      name: 'Ada Lovelace',
      mobile: '+14155552671',
      city: 'London',
      state: 'London',
      status: 'ACTIVE',
    },
    overrides,
  );
}

function customerResponse(customer: Customer) {
  return {
    id: customer.id,
    name: customer.name,
    mobile: customer.mobile,
    city: customer.city,
    state: customer.state,
    status: customer.status,
  };
}
