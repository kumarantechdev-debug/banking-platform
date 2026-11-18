import { jest } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import { BANKING_GRPC_CLIENT } from '../grpc/grpc-clients.module.js';
import { CreateAccountDto, CreateTransferDto } from './banking.dto.js';
import {
  AccountsController,
  TransfersController,
} from './banking.controller.js';
import { BankingService } from './banking.service.js';

describe('AccountsController', () => {
  let controller: AccountsController;
  const service = { createAccount: jest.fn(), getAccount: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccountsController],
      providers: [{ provide: BankingService, useValue: service }],
    }).compile();
    controller = module.get(AccountsController);
  });

  it('passes account creation input to the banking service', async () => {
    const dto: CreateAccountDto = { customerId: 7, initialBalance: '100.00' };
    service.createAccount.mockResolvedValue({ id: 3, customerId: 7 });

    await expect(controller.create(dto)).resolves.toMatchObject({ id: 3 });
    expect(service.createAccount).toHaveBeenCalledWith(dto);
  });

  it.each([
    { input: 0, normalized: '0' },
    { input: '0', normalized: '0' },
    { input: 1000, normalized: '1000' },
    { input: '1000', normalized: '1000' },
    { input: 1000.5, normalized: '1000.5' },
    { input: '1000.50', normalized: '1000.50' },
  ])(
    'normalizes and forwards valid initial balance $input as a string',
    async ({ input, normalized }) => {
      const dto = plainToInstance(CreateAccountDto, {
        customerId: 7,
        initialBalance: input,
      });

      expect(dto.initialBalance).toBe(normalized);
      await expect(validate(dto)).resolves.toHaveLength(0);
      await controller.create(dto);
      expect(service.createAccount).toHaveBeenCalledWith({
        customerId: 7,
        initialBalance: normalized,
      });
    },
  );
});

describe('CreateAccountDto initialBalance validation', () => {
  it.each([
    -100,
    '-100',
    'words',
    '',
    Number.NaN,
    Number.POSITIVE_INFINITY,
    'NaN',
    'Infinity',
    1000.001,
    '1000.001',
  ])('rejects invalid initial balance %p', async (initialBalance) => {
    const dto = plainToInstance(CreateAccountDto, {
      customerId: 7,
      initialBalance,
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'initialBalance')).toBe(
      true,
    );
  });
});

describe('BankingService', () => {
  it('maps account retrieval to the BankingService GetAccount RPC', async () => {
    const account = {
      id: 3,
      accountNumber: 'BA000000000000001',
      customerId: 7,
      balance: '100.00',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const rpc = { getAccount: jest.fn().mockReturnValue(of(account)) };
    const module = await Test.createTestingModule({
      providers: [
        BankingService,
        {
          provide: BANKING_GRPC_CLIENT,
          useValue: { getService: jest.fn().mockReturnValue(rpc) },
        },
      ],
    }).compile();
    const service = module.get(BankingService);
    service.onModuleInit();

    await expect(service.getAccount(3)).resolves.toEqual(account);
    expect(rpc.getAccount).toHaveBeenCalledWith({ accountId: 3 });
  });
});

describe('TransfersController', () => {
  let controller: TransfersController;
  const service = { createTransfer: jest.fn(), getTransfer: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransfersController],
      providers: [{ provide: BankingService, useValue: service }],
    }).compile();
    controller = module.get(TransfersController);
  });

  it('passes transfer creation input to the banking service', async () => {
    const dto: CreateTransferDto = {
      fromAccountId: 3,
      toAccountId: 4,
      amount: '25.00',
      idempotencyKey: 'transfer-123',
    };
    service.createTransfer.mockResolvedValue({ id: 18 });

    await expect(controller.create(dto)).resolves.toEqual({ id: 18 });
    expect(service.createTransfer).toHaveBeenCalledWith(dto);
  });
});
