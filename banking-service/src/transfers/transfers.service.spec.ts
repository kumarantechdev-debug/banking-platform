import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { jest } from '@jest/globals';
import { DataSource, EntityManager } from 'typeorm';
import { Account, AccountStatus } from '../accounts/account.entity';
import { AccountBalanceLedgerEntry } from '../ledger/account-balance-ledger-entry.entity';
import { TransferAudit, TransferAuditAction } from './transfer-audit.entity';
import {
  Transfer,
  TransferSettlementStatus,
  TransferStatus,
} from './transfer.entity';
import { TransfersService } from './transfers.service';

interface HarnessOptions {
  existingTransfer?: Transfer;
  duplicateTransfer?: Transfer;
  transferAfterAccountLock?: Transfer;
  transferSaveError?: Error;
  accountSaveError?: Error;
  auditSaveErrorAt?: number;
  auditSaveError?: Error;
  ledgerSaveError?: Error;
}

function makeAccount(
  id: number,
  balance: string,
  accountStatus = AccountStatus.ACTIVE,
): Account {
  return Object.assign(new Account(), {
    id,
    balance,
    status: accountStatus,
  });
}

function makeTransfer(overrides: Partial<Transfer> = {}): Transfer {
  return Object.assign(new Transfer(), {
    id: 11,
    referenceNumber: 'TR-existing',
    fromAccountId: 9,
    toAccountId: 3,
    amount: '0.10',
    status: TransferStatus.SUCCESS,
    settlementStatus: TransferSettlementStatus.PENDING,
    idempotencyKey: 'transfer-001',
    createdAt: new Date('2026-01-02T03:04:05.000Z'),
    ...overrides,
  });
}

function databaseError(code: string, errno: number): Error {
  return Object.assign(new Error('database operation failed'), {
    driverError: { code, errno },
  });
}

function createService(accountRows: Account[], options: HarnessOptions = {}) {
  let nextTransferId = 100;
  let auditSaveCount = 0;
  let transactionIdempotencyLookups = 0;
  const committedTransfers: Transfer[] = options.existingTransfer
    ? [options.existingTransfer]
    : [];
  const committedAudits: TransferAudit[] = [];
  const committedLedgerEntries: Partial<AccountBalanceLedgerEntry>[] = [];
  const accountSaveCalls: Account[][] = [];
  const lockOptions: {
    mode?: string;
    order?: [string, 'ASC' | 'DESC'];
    accountIds?: number[];
  } = {};

  const externalTransferRepository = {
    findOneBy: jest.fn(
      async (where: { id?: number; idempotencyKey?: string }) => {
        const candidates = [
          ...committedTransfers,
          ...(options.duplicateTransfer ? [options.duplicateTransfer] : []),
        ];
        if (where.idempotencyKey) {
          return (
            candidates.find(
              (transfer) => transfer.idempotencyKey === where.idempotencyKey,
            ) ?? null
          );
        }
        if (where.id !== undefined) {
          return (
            candidates.find((transfer) => transfer.id === where.id) ?? null
          );
        }
        return null;
      },
    ),
    find: jest.fn(async () => committedTransfers),
    update: jest.fn(
      async (
        where: Partial<Transfer>,
        updates: Partial<Transfer>,
      ): Promise<{ affected: number }> => {
        const transfer = committedTransfers.find((candidate) =>
          Object.entries(where).every(
            ([key, value]) => candidate[key as keyof Transfer] === value,
          ),
        );
        if (!transfer) {
          return { affected: 0 };
        }
        Object.assign(transfer, updates);
        return { affected: 1 };
      },
    ),
  };

  const dataSource = {
    transaction: jest.fn(
      async (
        _isolation: string,
        callback: (entityManager: EntityManager) => Promise<unknown>,
      ) => {
        const workingAccounts = accountRows.map((account) =>
          Object.assign(new Account(), account),
        );
        const stagedTransfers: Transfer[] = [];
        const stagedAudits: TransferAudit[] = [];
        const stagedLedgerEntries: Partial<AccountBalanceLedgerEntry>[] = [];
        const stagedAccounts: Account[] = [];

        const accountQueryBuilder = {
          setLock: jest.fn((mode: string) => {
            lockOptions.mode = mode;
            return accountQueryBuilder;
          }),
          where: jest.fn(
            (_query: string, parameters: { accountIds: number[] }) => {
              lockOptions.accountIds = parameters.accountIds;
              return accountQueryBuilder;
            },
          ),
          orderBy: jest.fn((column: string, order: 'ASC' | 'DESC') => {
            lockOptions.order = [column, order];
            return accountQueryBuilder;
          }),
          getMany: jest.fn(async () =>
            workingAccounts.filter((account) =>
              lockOptions.accountIds?.includes(account.id),
            ),
          ),
        };
        const accountRepository = {
          createQueryBuilder: jest.fn(() => accountQueryBuilder),
        };
        const transferRepository = {
          findOneBy: jest.fn(async (where: { idempotencyKey: string }) => {
            transactionIdempotencyLookups += 1;
            return (
              committedTransfers.find(
                (transfer) => transfer.idempotencyKey === where.idempotencyKey,
              ) ??
              (transactionIdempotencyLookups > 1 &&
              options.transferAfterAccountLock?.idempotencyKey ===
                where.idempotencyKey
                ? options.transferAfterAccountLock
                : null)
            );
          }),
          create: jest.fn((values: Partial<Transfer>) =>
            Object.assign(new Transfer(), values),
          ),
          save: jest.fn(async (transfer: Transfer) => {
            if (options.transferSaveError) {
              throw options.transferSaveError;
            }
            const saved = Object.assign(new Transfer(), transfer, {
              id: nextTransferId++,
              createdAt: new Date(),
            });
            stagedTransfers.push(saved);
            return saved;
          }),
        };
        const auditRepository = {
          create: jest.fn((values: Partial<TransferAudit>) =>
            Object.assign(new TransferAudit(), values),
          ),
          save: jest.fn(async (audit: TransferAudit) => {
            auditSaveCount += 1;
            if (
              options.auditSaveErrorAt === auditSaveCount &&
              options.auditSaveError
            ) {
              throw options.auditSaveError;
            }
            stagedAudits.push(audit);
            return audit;
          }),
        };
        const ledgerRepository = {
          save: jest.fn(
            async (entries: Partial<AccountBalanceLedgerEntry>[]) => {
              if (options.ledgerSaveError) {
                throw options.ledgerSaveError;
              }
              stagedLedgerEntries.push(...entries);
              return entries;
            },
          ),
        };
        const manager = {
          getRepository: jest.fn(
            (
              entity:
                | typeof Account
                | typeof Transfer
                | typeof TransferAudit
                | typeof AccountBalanceLedgerEntry,
            ) => {
              if (entity === Account) return accountRepository;
              if (entity === Transfer) return transferRepository;
              if (entity === AccountBalanceLedgerEntry) return ledgerRepository;
              return auditRepository;
            },
          ),
          save: jest.fn(async (accounts: Account[]) => {
            if (options.accountSaveError) {
              throw options.accountSaveError;
            }
            accountSaveCalls.push(accounts);
            stagedAccounts.push(...accounts);
            return accounts;
          }),
        };

        const result = await callback(manager as unknown as EntityManager);
        for (const updated of stagedAccounts) {
          const persisted = accountRows.find(
            (account) => account.id === updated.id,
          );
          if (persisted) {
            persisted.balance = updated.balance;
            persisted.status = updated.status;
          }
        }
        committedTransfers.push(...stagedTransfers);
        committedAudits.push(...stagedAudits);
        committedLedgerEntries.push(...stagedLedgerEntries);
        return result;
      },
    ),
    getRepository: jest.fn(() => externalTransferRepository),
  };

  return {
    service: new TransfersService(dataSource as unknown as DataSource),
    committedTransfers,
    committedAudits,
    committedLedgerEntries,
    accountSaveCalls,
    lockOptions,
    dataSource,
    repository: externalTransferRepository,
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

describe('TransfersService', () => {
  const request = {
    fromAccountId: 9,
    toAccountId: 3,
    amount: '0.10',
    idempotencyKey: 'transfer-001',
  };

  it('locks accounts in ascending order and commits exact balances, transfer, and audits', async () => {
    const source = makeAccount(9, '10.05');
    const destination = makeAccount(3, '2.10');
    const context = createService([destination, source]);

    const transfer = await context.service.createTransfer(request);

    expect(context.dataSource.transaction).toHaveBeenCalledWith(
      'READ COMMITTED',
      expect.any(Function),
    );
    expect(context.lockOptions).toMatchObject({
      mode: 'pessimistic_write',
      accountIds: [3, 9],
      order: ['account.id', 'ASC'],
    });
    expect(source.balance).toBe('9.95');
    expect(destination.balance).toBe('2.20');
    expect(context.accountSaveCalls[0]).toHaveLength(2);
    expect(context.committedTransfers).toHaveLength(1);
    expect(context.committedTransfers[0].status).toBe(TransferStatus.SUCCESS);
    expect(context.committedAudits.map((audit) => audit.action)).toEqual([
      TransferAuditAction.INITIATED,
      TransferAuditAction.COMPLETED,
    ]);
    expect(context.committedLedgerEntries).toMatchObject([
      {
        accountId: 9,
        transferId: 100,
        entryType: 'TRANSFER',
        transactionType: 'DEBIT',
        amount: '0.10',
        balanceAfter: '9.95',
      },
      {
        accountId: 3,
        transferId: 100,
        entryType: 'TRANSFER',
        transactionType: 'CREDIT',
        amount: '0.10',
        balanceAfter: '2.20',
      },
    ]);
    expect(transfer.amount).toBe('0.10');
  });

  it.each(['0', '0.00', '-1.00', '1.001', '10000000000000.00', '1e2'])(
    'rejects invalid amount %s before opening a transaction',
    async (amount) => {
      const context = createService([]);

      await expectRpcCode(
        context.service.createTransfer({ ...request, amount }),
        status.INVALID_ARGUMENT,
      );
      expect(context.dataSource.transaction).not.toHaveBeenCalled();
    },
  );

  it('rejects invalid account IDs and idempotency keys', async () => {
    const context = createService([]);

    await expectRpcCode(
      context.service.createTransfer({ ...request, fromAccountId: 0 }),
      status.INVALID_ARGUMENT,
    );
    await expectRpcCode(
      context.service.createTransfer({ ...request, idempotencyKey: 'short' }),
      status.INVALID_ARGUMENT,
    );
    await expectRpcCode(
      context.service.createTransfer({
        ...request,
        idempotencyKey: 12345678 as unknown as string,
      }),
      status.INVALID_ARGUMENT,
    );
    expect(context.dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects transfers between the same account', async () => {
    const context = createService([]);

    await expectRpcCode(
      context.service.createTransfer({
        ...request,
        toAccountId: request.fromAccountId,
      }),
      status.INVALID_ARGUMENT,
    );
    expect(context.dataSource.transaction).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND when the source account is missing', async () => {
    const context = createService([makeAccount(3, '2.10')]);

    await expectRpcCode(
      context.service.createTransfer(request),
      status.NOT_FOUND,
    );
    expect(context.committedTransfers).toHaveLength(0);
    expect(context.committedAudits).toHaveLength(0);
    expect(context.committedLedgerEntries).toHaveLength(0);
  });

  it('returns NOT_FOUND when the destination account is missing', async () => {
    const context = createService([makeAccount(9, '10.05')]);

    await expectRpcCode(
      context.service.createTransfer(request),
      status.NOT_FOUND,
    );
    expect(context.committedTransfers).toHaveLength(0);
    expect(context.committedAudits).toHaveLength(0);
  });

  it.each([
    ['source', 9],
    ['destination', 3],
  ])(
    'rejects an inactive %s account and rolls back all writes',
    async (_, inactiveId) => {
      const context = createService([
        makeAccount(
          9,
          '10.05',
          inactiveId === 9 ? AccountStatus.INACTIVE : AccountStatus.ACTIVE,
        ),
        makeAccount(
          3,
          '2.10',
          inactiveId === 3 ? AccountStatus.INACTIVE : AccountStatus.ACTIVE,
        ),
      ]);

      await expectRpcCode(
        context.service.createTransfer(request),
        status.FAILED_PRECONDITION,
      );
      expect(context.committedTransfers).toHaveLength(0);
      expect(context.committedAudits).toHaveLength(0);
      expect(context.accountSaveCalls).toHaveLength(0);
    },
  );

  it('rejects insufficient funds without committing a transfer or changing balances', async () => {
    const source = makeAccount(9, '0.05');
    const destination = makeAccount(3, '2.10');
    const context = createService([source, destination]);

    await expectRpcCode(
      context.service.createTransfer(request),
      status.FAILED_PRECONDITION,
    );
    expect(source.balance).toBe('0.05');
    expect(destination.balance).toBe('2.10');
    expect(context.committedTransfers).toHaveLength(0);
    expect(context.committedAudits).toHaveLength(0);
    expect(context.accountSaveCalls).toHaveLength(0);
  });

  it('rejects a destination balance exceeding DECIMAL(15,2)', async () => {
    const context = createService([
      makeAccount(9, '1.00'),
      makeAccount(3, '9999999999999.99'),
    ]);

    await expectRpcCode(
      context.service.createTransfer({ ...request, amount: '0.01' }),
      status.FAILED_PRECONDITION,
    );
    expect(context.committedTransfers).toHaveLength(0);
    expect(context.committedAudits).toHaveLength(0);
  });

  it('returns the original result for a repeated matching key without reapplying balances', async () => {
    const source = makeAccount(9, '10.05');
    const destination = makeAccount(3, '2.10');
    const context = createService([source, destination]);

    const original = await context.service.createTransfer(request);
    await expect(context.service.createTransfer(request)).resolves.toBe(
      original,
    );
    expect(source.balance).toBe('9.95');
    expect(destination.balance).toBe('2.20');
    expect(context.committedTransfers).toHaveLength(1);
    expect(context.committedAudits).toHaveLength(2);
    expect(context.accountSaveCalls).toHaveLength(1);
  });

  it('uses a distinct idempotency key to process a distinct transfer', async () => {
    const source = makeAccount(9, '10.05');
    const destination = makeAccount(3, '2.10');
    const context = createService([source, destination]);

    const first = await context.service.createTransfer(request);
    const second = await context.service.createTransfer({
      ...request,
      idempotencyKey: 'transfer-002',
    });

    expect(second.id).not.toBe(first.id);
    expect(source.balance).toBe('9.85');
    expect(destination.balance).toBe('2.30');
    expect(context.committedTransfers).toHaveLength(2);
    expect(context.committedAudits).toHaveLength(4);
    expect(context.accountSaveCalls).toHaveLength(2);
  });

  it('rejects reusing an idempotency key with different transfer details', async () => {
    const context = createService([], { existingTransfer: makeTransfer() });

    await expectRpcCode(
      context.service.createTransfer({ ...request, amount: '0.20' }),
      status.ALREADY_EXISTS,
    );
    expect(context.committedTransfers).toHaveLength(1);
  });

  it('recovers a concurrent duplicate-key insert by returning the original transfer', async () => {
    const duplicate = makeTransfer();
    const source = makeAccount(9, '10.05');
    const destination = makeAccount(3, '2.10');
    const context = createService([source, destination], {
      duplicateTransfer: duplicate,
      transferSaveError: databaseError('ER_DUP_ENTRY', 1062),
    });

    const results = await Promise.all([
      context.service.createTransfer(request),
      context.service.createTransfer(request),
    ]);
    expect(results).toEqual([duplicate, duplicate]);
    expect(source.balance).toBe('10.05');
    expect(destination.balance).toBe('2.10');
    expect(context.accountSaveCalls).toHaveLength(0);
    expect(context.committedAudits).toHaveLength(0);
  });

  it('returns a concurrent winner after account locks before rechecking funds', async () => {
    const original = makeTransfer();
    const source = makeAccount(9, '0.05');
    const destination = makeAccount(3, '2.20');
    const context = createService([source, destination], {
      transferAfterAccountLock: original,
    });

    await expect(context.service.createTransfer(request)).resolves.toBe(
      original,
    );
    expect(source.balance).toBe('0.05');
    expect(destination.balance).toBe('2.20');
    expect(context.accountSaveCalls).toHaveLength(0);
    expect(context.committedTransfers).toHaveLength(0);
    expect(context.committedAudits).toHaveLength(0);
  });

  it('serializes competing transfers so they cannot overdraw a shared source account', async () => {
    const source = makeAccount(9, '10.05');
    const destination = makeAccount(3, '2.10');
    const context = createService([source, destination]);
    const executeTransaction = context.dataSource.transaction;
    let transactionTail = Promise.resolve();

    context.dataSource.transaction = jest.fn(
      async (
        isolation: string,
        callback: (manager: EntityManager) => Promise<unknown>,
      ) => {
        const previousTransaction = transactionTail;
        let releaseTransaction: () => void = () => undefined;
        transactionTail = new Promise<void>((resolve) => {
          releaseTransaction = resolve;
        });
        await previousTransaction;
        try {
          return await executeTransaction(isolation, callback);
        } finally {
          releaseTransaction();
        }
      },
    );

    const outcomes = await Promise.all([
      context.service
        .createTransfer({
          ...request,
          amount: '6.00',
          idempotencyKey: 'transfer-concurrent-1',
        })
        .then(
          (transfer) => ({ transfer }),
          (error: unknown) => ({ error }),
        ),
      context.service
        .createTransfer({
          ...request,
          amount: '6.00',
          idempotencyKey: 'transfer-concurrent-2',
        })
        .then(
          (transfer) => ({ transfer }),
          (error: unknown) => ({ error }),
        ),
    ]);

    expect(outcomes.filter((outcome) => 'transfer' in outcome)).toHaveLength(1);
    expect(outcomes.filter((outcome) => 'error' in outcome)).toHaveLength(1);
    const rejected = outcomes.find((outcome) => 'error' in outcome);
    const error = rejected && 'error' in rejected ? rejected.error : undefined;
    expect(error).toBeInstanceOf(RpcException);
    if (error instanceof RpcException) {
      expect(error.getError()).toMatchObject({
        code: status.FAILED_PRECONDITION,
      });
    }
    expect(source.balance).toBe('4.05');
    expect(destination.balance).toBe('8.10');
    expect(context.committedTransfers).toHaveLength(1);
    expect(context.committedLedgerEntries).toHaveLength(2);
    expect(context.lockOptions).toMatchObject({
      mode: 'pessimistic_write',
      accountIds: [3, 9],
      order: ['account.id', 'ASC'],
    });
  });

  it('allows retrying a failed transfer with the same key after the failure is resolved', async () => {
    const source = makeAccount(9, '0.05');
    const destination = makeAccount(3, '2.10');
    const context = createService([source, destination]);

    await expectRpcCode(
      context.service.createTransfer(request),
      status.FAILED_PRECONDITION,
    );
    expect(context.committedTransfers).toHaveLength(0);

    source.balance = '1.00';
    const transfer = await context.service.createTransfer(request);

    expect(transfer.idempotencyKey).toBe(request.idempotencyKey);
    expect(source.balance).toBe('0.90');
    expect(destination.balance).toBe('2.20');
    expect(context.committedTransfers).toHaveLength(1);
    expect(context.committedLedgerEntries).toHaveLength(2);
  });

  it('rolls back transfer, balances, and audits when an audit write fails', async () => {
    const source = makeAccount(9, '10.05');
    const destination = makeAccount(3, '2.10');
    const context = createService([source, destination], {
      auditSaveErrorAt: 2,
      auditSaveError: new Error('audit write failed'),
    });

    await expectRpcCode(
      context.service.createTransfer(request),
      status.INTERNAL,
    );
    expect(source.balance).toBe('10.05');
    expect(destination.balance).toBe('2.10');
    expect(context.committedTransfers).toHaveLength(0);
    expect(context.committedAudits).toHaveLength(0);
    expect(context.committedLedgerEntries).toHaveLength(0);
  });

  it('rolls back balances and transfer records when a ledger write fails', async () => {
    const source = makeAccount(9, '10.05');
    const destination = makeAccount(3, '2.10');
    const context = createService([source, destination], {
      ledgerSaveError: new Error('ledger write failed'),
    });

    await expectRpcCode(
      context.service.createTransfer(request),
      status.INTERNAL,
    );
    expect(source.balance).toBe('10.05');
    expect(destination.balance).toBe('2.10');
    expect(context.committedTransfers).toHaveLength(0);
    expect(context.committedLedgerEntries).toHaveLength(0);
  });

  it('maps MySQL deadlocks and lock-wait timeouts to RESOURCE_EXHAUSTED', async () => {
    for (const error of [
      databaseError('ER_LOCK_DEADLOCK', 1213),
      databaseError('ER_LOCK_WAIT_TIMEOUT', 1205),
    ]) {
      const context = createService(
        [makeAccount(9, '10.05'), makeAccount(3, '2.10')],
        { accountSaveError: error },
      );

      await expectRpcCode(
        context.service.createTransfer(request),
        status.RESOURCE_EXHAUSTED,
      );
      expect(context.committedTransfers).toHaveLength(0);
      expect(context.committedAudits).toHaveLength(0);
    }
  });

  it('retrieves a transfer by transferId', async () => {
    const transfer = makeTransfer();
    const context = createService([], { existingTransfer: transfer });

    await expect(
      context.service.getTransfer({ transferId: transfer.id }),
    ).resolves.toBe(transfer);
  });

  it('returns NOT_FOUND for a missing transfer and INVALID_ARGUMENT for an invalid ID', async () => {
    const context = createService([]);

    await expectRpcCode(
      context.service.getTransfer({ transferId: 0 }),
      status.INVALID_ARGUMENT,
    );
    await expectRpcCode(
      context.service.getTransfer({ transferId: 99 }),
      status.NOT_FOUND,
    );
  });

  it('retrieves only successful unsettled transfers in the requested batch', async () => {
    const pending = makeTransfer({ id: 21 });
    const context = createService([]);
    context.repository.find.mockResolvedValue([pending]);

    await expect(
      context.service.getPendingTransfers({
        batchSize: 100,
        status: 'PENDING',
        afterTransferId: 0,
      }),
    ).resolves.toMatchObject({ transfers: [pending], nextAfterTransferId: 21 });
    expect(context.repository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: TransferStatus.SUCCESS,
          settlementStatus: TransferSettlementStatus.PENDING,
        }),
        order: { id: 'ASC' },
        take: 100,
      }),
    );
  });

  it('rejects invalid pending-transfer batch requests', async () => {
    const context = createService([]);

    await expectRpcCode(
      context.service.getPendingTransfers({
        batchSize: 101,
        status: 'PENDING',
        afterTransferId: 0,
      }),
      status.INVALID_ARGUMENT,
    );
    await expectRpcCode(
      context.service.getPendingTransfers({
        batchSize: 100,
        status: 'SETTLED',
        afterTransferId: 0,
      }),
      status.INVALID_ARGUMENT,
    );
    expect(context.repository.find).not.toHaveBeenCalled();
  });

  it('settles a successful transfer idempotently', async () => {
    const transfer = makeTransfer({ id: 21 });
    const context = createService([], { existingTransfer: transfer });
    const input = { transferId: 21, settlementStatus: 'SETTLED' };

    await expect(
      context.service.updateTransferSettlementStatus(input),
    ).resolves.toMatchObject({ success: true });
    await expect(
      context.service.updateTransferSettlementStatus(input),
    ).resolves.toMatchObject({
      success: true,
      message: 'Transfer is already settled.',
    });
    expect(transfer.settlementStatus).toBe(TransferSettlementStatus.SETTLED);
  });

  it('rejects invalid settlement updates and reports missing transfers', async () => {
    const context = createService([]);

    await expectRpcCode(
      context.service.updateTransferSettlementStatus({
        transferId: 0,
        settlementStatus: 'SETTLED',
      }),
      status.INVALID_ARGUMENT,
    );
    await expectRpcCode(
      context.service.updateTransferSettlementStatus({
        transferId: 21,
        settlementStatus: 'PENDING',
      }),
      status.INVALID_ARGUMENT,
    );
    await expectRpcCode(
      context.service.updateTransferSettlementStatus({
        transferId: 21,
        settlementStatus: 'SETTLED',
      }),
      status.NOT_FOUND,
    );
  });
});
