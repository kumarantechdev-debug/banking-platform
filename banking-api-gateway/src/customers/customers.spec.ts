import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import { CUSTOMER_GRPC_CLIENT } from '../grpc/grpc-clients.module.js';
import { CreateCustomerDto } from './customer.dto.js';
import { CustomersController } from './customers.controller.js';
import { CustomersService } from './customers.service.js';

describe('CustomersController', () => {
  let controller: CustomersController;
  const service = {
    create: jest.fn(),
    getById: jest.fn(),
    list: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomersController],
      providers: [{ provide: CustomersService, useValue: service }],
    }).compile();
    controller = module.get(CustomersController);
  });

  it('passes customer creation input to the service', async () => {
    const dto: CreateCustomerDto = {
      name: 'Asha',
      mobile: '+14155552671',
      city: 'Austin',
      state: 'Texas',
      password: 'Test@12345',
    };
    service.create.mockResolvedValue({
      id: 1,
      name: dto.name,
      mobile: dto.mobile,
      city: dto.city,
      state: dto.state,
      status: 'ACTIVE',
    });

    await expect(controller.create(dto)).resolves.toMatchObject({ id: 1 });
    expect(service.create).toHaveBeenCalledWith(dto);
  });

});

describe('CustomersService', () => {
  it('calls the CustomerService GetCustomer RPC with the contract field', async () => {
    const expected = {
      id: 7,
      name: 'Asha',
      mobile: '+14155552671',
      city: 'Austin',
      state: 'Texas',
      status: 'ACTIVE',
    };
    const rpc = { getCustomer: jest.fn().mockReturnValue(of(expected)) };
    const module = await Test.createTestingModule({
      providers: [
        CustomersService,
        {
          provide: CUSTOMER_GRPC_CLIENT,
          useValue: { getService: jest.fn().mockReturnValue(rpc) },
        },
      ],
    }).compile();
    const service = module.get(CustomersService);
    service.onModuleInit();

    await expect(service.getById(7)).resolves.toEqual(expected);
    expect(rpc.getCustomer).toHaveBeenCalledWith({ id: 7 });
  });
});
