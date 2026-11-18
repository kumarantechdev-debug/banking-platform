import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { jest } from '@jest/globals';
import { Repository } from 'typeorm';
import { Account, AccountStatus } from './account.entity';
import { AccountsService } from './accounts.service';
import { CustomerClientService } from '../customers/customer-client.service';
import { AccountBalanceLedgerEntry } from '../ledger/account-balance-ledger-entry.entity';
import { DataSource, EntityManager } from 'typeorm';

function createService() {
  const accounts = {
    create: jest.fn((values: Partial<Account>) =>
      Object.assign(new Account(), values),
    ),
    save: jest.fn(async (account: Account) =>
      Object.assign(new Account(), account, { id: 41 }),
    ),
    findOneBy: jest.fn(
      async (_criteria: { id: number }) => null as Account | null,
    ),
  };
  const customers = {
    assertCustomerExists: jest.fn(async (_customerId: number) => undefined),
  };
  const ledgerEntries: Partial<AccountBalanceLedgerEntry>[] = [];
  const manager = {
    getRepository: jest.fn((entity: typeof Account | typeof AccountBalanceLedgerEntry) =>
      entity === Account
        ? accounts
        : {
            save: jest.fn(async (entry: Partial<AccountBalanceLedgerEntry>) => {
              ledgerEntries.push(entry);
              return entry;
            }),
          },
    ),
  };
  const dataSource = {
    transaction: jest.fn(
      async <T>(run: (manager: EntityManager) => Promise<T>) =>
        run(manager as unknown as EntityManager),
    ),
  };

  return {
    service: new AccountsService(
      accounts as unknown as Repository<Account>,
      customers as unknown as CustomerClientService,
      dataSource as unknown as DataSource,
    ),
    accounts,
    customers,
    dataSource,
    ledgerEntries,
  };
}

async function expectRpcCode(
  operation: Promise<unknown>,
  code: number,
): Promise<void> {
  const error = await operation.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(RpcException);
  if (!(error instanceof RpcException)) {
    throw error;
  }
  expect(error.getError()).toMatchObject({ code });
}

function duplicateAccountNumberError(): Error {
  return Object.assign(new Error('duplicate account number'), {
    driverError: { code: 'ER_DUP_ENTRY', errno: 1062 },
  });
}

describe('AccountsService', () => {
  it('creates an active account with a normalized decimal balance after customer validation', async () => {
    const context = createService();

    const account = await context.service.createAccount({
      customerId: 7,
      initialBalance: '12.3',
    });

    expect(context.customers.assertCustomerExists).toHaveBeenCalledWith(7);
    expect(account).toMatchObject({
      id: 41,
      customerId: 7,
      balance: '12.30',
      status: AccountStatus.ACTIVE,
    });
    expect(account.accountNumber).toMatch(/^BA\d{15}$/);
    expect(context.dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(context.ledgerEntries).toMatchObject([
      {
        accountId: 41,
        entryType: 'ACCOUNT_OPENING',
        amount: '12.30',
        balanceAfter: '12.30',
      },
    ]);
  });

  it('retries a colliding account number', async () => {
    const context = createService();
    context.accounts.save
      .mockRejectedValueOnce(duplicateAccountNumberError())
      .mockResolvedValueOnce(
        Object.assign(new Account(), {
          id: 42,
          accountNumber: 'BA000000000000042',
        }),
      );

    await expect(
      context.service.createAccount({ customerId: 7, initialBalance: '0' }),
    ).resolves.toMatchObject({ id: 42 });
    expect(context.accounts.create).toHaveBeenCalledTimes(2);
    expect(context.accounts.save).toHaveBeenCalledTimes(2);
  });

  it('rejects invalid customer IDs and negative initial balances before calling Customer Service', async () => {
    const context = createService();

    await expectRpcCode(
      context.service.createAccount({ customerId: 0, initialBalance: '0' }),
      status.INVALID_ARGUMENT,
    );
    await expectRpcCode(
      context.service.createAccount({ customerId: 7, initialBalance: '-0.01' }),
      status.INVALID_ARGUMENT,
    );

    expect(context.customers.assertCustomerExists).not.toHaveBeenCalled();
    expect(context.accounts.save).not.toHaveBeenCalled();
  });

  it('propagates Customer Service NOT_FOUND and UNAVAILABLE errors', async () => {
    const context = createService();
    context.customers.assertCustomerExists
      .mockRejectedValueOnce(
        new RpcException({
          code: status.NOT_FOUND,
          message: 'Customer not found.',
        }),
      )
      .mockRejectedValueOnce(
        new RpcException({
          code: status.UNAVAILABLE,
          message: 'Customer service is unavailable.',
        }),
      );

    await expectRpcCode(
      context.service.createAccount({ customerId: 7, initialBalance: '0' }),
      status.NOT_FOUND,
    );
    await expectRpcCode(
      context.service.createAccount({ customerId: 7, initialBalance: '0' }),
      status.UNAVAILABLE,
    );
    expect(context.accounts.save).not.toHaveBeenCalled();
  });

  it('retrieves an account by accountId', async () => {
    const context = createService();
    const account = Object.assign(new Account(), { id: 41 });
    context.accounts.findOneBy.mockResolvedValue(account);

    await expect(context.service.getAccount({ accountId: 41 })).resolves.toBe(
      account,
    );
    expect(context.accounts.findOneBy).toHaveBeenCalledWith({ id: 41 });
  });

  it('rejects invalid and missing account IDs', async () => {
    const context = createService();

    await expectRpcCode(
      context.service.getAccount({ accountId: 0 }),
      status.INVALID_ARGUMENT,
    );
    await expectRpcCode(
      context.service.getAccount({ accountId: 41 }),
      status.NOT_FOUND,
    );
    expect(context.accounts.findOneBy).toHaveBeenCalledTimes(1);
  });
});
