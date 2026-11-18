import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { jest } from '@jest/globals';
import { DataSource, EntityManager } from 'typeorm';
import {
  AccountTransactionHistoryService,
  GetAccountTransactionHistoryInput,
} from './account-transaction-history.service';

interface QueryFixture {
  openingBalance?: string;
  closingBalance?: string;
  createdDate?: string;
  total?: number;
  transactions?: Array<Record<string, unknown>>;
  baseline?: string;
}

function createService(fixture: QueryFixture = {}) {
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  const manager = {
    query: jest.fn(async (sql: string, parameters: unknown[] = []) => {
      calls.push({ sql, parameters });
      if (sql.includes('FROM accounts')) {
        return fixture.createdDate === null
          ? []
          : [{ id: 8, createdDate: fixture.createdDate ?? '2025-01-01' }];
      }
      if (sql.includes('AS snapshotAt')) {
        return [{ snapshotAt: '2026-04-30 23:59:59.999999' }];
      }
      if (sql.includes("entryType = 'BASELINE'")) {
        return fixture.baseline ? [{ effectiveAt: fixture.baseline }] : [];
      }
      if (sql.includes('SELECT COUNT(*) AS total')) {
        return [{ total: fixture.total ?? 0 }];
      }
      if (sql.includes('SELECT transferId, COALESCE(referenceNumber')) {
        return fixture.transactions ?? [];
      }
      if (sql.includes('DATE_ADD')) {
        return fixture.closingBalance === undefined
          ? []
          : [{ balanceAfter: fixture.closingBalance }];
      }
      if (sql.includes('SELECT CAST(balanceAfter AS CHAR)')) {
        return fixture.openingBalance === undefined
          ? []
          : [{ balanceAfter: fixture.openingBalance }];
      }
      throw new Error(`Unexpected SQL in test: ${sql}`);
    }),
  };
  const dataSource = {
    transaction: jest.fn(
      async (
        _isolation: string,
        callback: (entityManager: EntityManager) => Promise<unknown>,
      ) => callback(manager as unknown as EntityManager),
    ),
  };

  return {
    service: new AccountTransactionHistoryService(
      dataSource as unknown as DataSource,
    ),
    calls,
    dataSource,
  };
}

async function expectRpcCode(
  operation: Promise<unknown>,
  code: number,
): Promise<RpcException> {
  const error = await operation.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(RpcException);
  if (!(error instanceof RpcException)) {
    throw error;
  }
  expect(error.getError()).toMatchObject({ code });
  return error;
}

const request: GetAccountTransactionHistoryInput = {
  accountId: 8,
  fromDate: '2026-04-01',
  toDate: '2026-04-30',
};

describe('AccountTransactionHistoryService', () => {
  it('returns exact opening and closing balances with credit/debit transactions', async () => {
    const context = createService({
      openingBalance: '100.00',
      closingBalance: '112.50',
      total: 2,
      transactions: [
        {
          transferId: 41,
          referenceNumber: 'TR-credit',
          transactionDate: '2026-04-02 09:00:00.000000',
          transactionType: 'CREDIT',
          amount: '20.00',
          description: 'Transfer from account 4',
        },
        {
          transferId: 42,
          referenceNumber: 'TR-debit',
          transactionDate: '2026-04-03 10:00:00.000000',
          transactionType: 'DEBIT',
          amount: '7.50',
          description: 'Transfer to account 5',
        },
      ],
    });

    await expect(
      context.service.getAccountTransactionHistory(request),
    ).resolves.toMatchObject({
      openingBalance: '100.00',
      closingBalance: '112.50',
      total: 2,
      transactions: [
        { transactionType: 'CREDIT', amount: '20.00' },
        { transactionType: 'DEBIT', amount: '7.50' },
      ],
    });
    expect(context.dataSource.transaction).toHaveBeenCalledWith(
      'REPEATABLE READ',
      expect.any(Function),
    );
  });

  it('includes an in-period account opening credit without inventing a transfer ID', async () => {
    const context = createService({
      openingBalance: '0.00',
      closingBalance: '50.00',
      total: 1,
      transactions: [
        {
          transferId: null,
          referenceNumber: '',
          transactionDate: '2026-04-02 09:00:00.000000',
          transactionType: 'CREDIT',
          amount: '50.00',
          description: 'Account opening balance',
          isAccountOpening: 1,
        },
      ],
    });

    await expect(
      context.service.getAccountTransactionHistory(request),
    ).resolves.toMatchObject({
      openingBalance: '0.00',
      closingBalance: '50.00',
      total: 1,
      transactions: [
        {
          referenceNumber: '',
          transactionType: 'CREDIT',
          amount: '50.00',
          isAccountOpening: true,
        },
      ],
    });
    const transaction = (await context.service.getAccountTransactionHistory(
      request,
    )).transactions[0];
    expect(transaction.transferId).toBeUndefined();
    expect(
      context.calls.find((call) =>
        call.sql.includes('SELECT transferId, COALESCE(referenceNumber'),
      )?.sql,
    ).toContain("entryType = 'ACCOUNT_OPENING'");
  });

  it('uses deterministic pagination and defaults zero-valued proto fields', async () => {
    const context = createService({
      openingBalance: '100.00',
      closingBalance: '112.50',
      total: 2,
      transactions: [
        {
          transferId: 42,
          referenceNumber: 'TR-debit',
          transactionDate: '2026-04-03 10:00:00.000000',
          transactionType: 'DEBIT',
          amount: '7.50',
          description: 'Transfer to account 5',
        },
      ],
    });

    await expect(
      context.service.getAccountTransactionHistory({
        ...request,
        page: 0,
        limit: 0,
      }),
    ).resolves.toMatchObject({ page: 1, limit: 10, totalPages: 1 });
    const transactionQuery = context.calls.find((call) =>
      call.sql.includes('SELECT transferId, COALESCE(referenceNumber'),
    );
    expect(transactionQuery?.sql).toContain(
      'ORDER BY effectiveAt ASC, transferId ASC, id ASC',
    );
    expect(transactionQuery?.parameters.slice(-2)).toEqual([10, 0]);

    const secondPage = createService({
      openingBalance: '100.00',
      closingBalance: '112.50',
      total: 21,
      transactions: [],
    });
    await expect(
      secondPage.service.getAccountTransactionHistory({
        ...request,
        page: 2,
        limit: 10,
      }),
    ).resolves.toMatchObject({ page: 2, limit: 10, totalPages: 3 });
    const secondPageQuery = secondPage.calls.find((call) =>
      call.sql.includes('SELECT transferId, COALESCE(referenceNumber'),
    );
    expect(secondPageQuery?.parameters.slice(-2)).toEqual([10, 10]);
  });

  it('does not fabricate an opening balance before the ledger baseline', async () => {
    const context = createService({
      createdDate: '2020-01-01',
      baseline: '2026-04-02 12:00:00.000000',
    });

    const error = await expectRpcCode(
      context.service.getAccountTransactionHistory(request),
      status.FAILED_PRECONDITION,
    );
    expect(error.getError()).toMatchObject({
      message: expect.stringContaining('older balances were not reconstructed'),
    });
  });

  it('rejects invalid date ranges and pagination inputs', async () => {
    const context = createService();
    await expectRpcCode(
      context.service.getAccountTransactionHistory({
        ...request,
        fromDate: '2026-02-30',
      }),
      status.INVALID_ARGUMENT,
    );
    await expectRpcCode(
      context.service.getAccountTransactionHistory({
        ...request,
        page: -1,
      }),
      status.INVALID_ARGUMENT,
    );
    await expectRpcCode(
      context.service.getAccountTransactionHistory({
        ...request,
        limit: 101,
      }),
      status.INVALID_ARGUMENT,
    );
    expect(context.dataSource.transaction).not.toHaveBeenCalled();
  });
});
