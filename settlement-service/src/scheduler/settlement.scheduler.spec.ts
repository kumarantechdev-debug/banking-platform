jest.mock('@nestjs/common', () => ({
  Injectable: () => (target: unknown) => target,
  Inject: () => () => undefined,
  Logger: class {
    log() {}
    warn() {}
    error() {}
  },
}));

jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));

jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_DAY_AT_1AM: '0 1 * * *' },
}));

jest.mock('@nestjs/microservices', () => ({
  RpcException: class extends Error {
    code: number;

    constructor(info: { code: number; message: string }) {
      super(info.message);
      this.code = info.code;
    }
  },
}));

jest.mock('@nestjs/typeorm', () => ({ InjectRepository: () => () => undefined }));

import { SettlementScheduler } from './settlement.scheduler';
import { SettlementTransactionStatus } from '../settlement-transaction/settlement-transaction.service';
import { SettlementAuditLogService } from '../settlement-audit-log/settlement-audit-log.service';

function createScheduler(
  transfers: Array<{ transferId: number; amount: number }>,
  auditInsert?: jest.Mock,
) {
  const job = {
    id: 17,
    jobDate: new Date('2024-01-15T00:00:00.000Z'),
    status: 'PENDING',
    totalTransactions: 0,
    successfulTransactions: 0,
    failedTransactions: 0,
    startedAt: null,
    completedAt: null,
    createdAt: new Date('2024-01-15T00:00:00.000Z'),
  };
  const records = new Map<number, Record<string, unknown>>();
  const jobService = {
    findById: jest.fn().mockResolvedValue(job),
    updateSummary: jest.fn().mockImplementation(async (_id, updates) => {
      Object.assign(job, updates);
      return job;
    }),
  };
  const transactionService = {
    findByTransferId: jest.fn().mockImplementation(async (transferId: number) => records.get(transferId) ?? null),
    createIfMissing: jest.fn().mockImplementation(async (input) => {
      const record = { ...input, retryCount: 0 };
      records.set(input.transferId, record);
      return record;
    }),
    claimForProcessing: jest.fn().mockImplementation(async (transferId: number) => {
      const record = records.get(transferId);
      if (!record || record.status !== SettlementTransactionStatus.PENDING) {
        return false;
      }
      record.status = SettlementTransactionStatus.PROCESSING;
      return true;
    }),
    recordRetryFailure: jest.fn().mockImplementation(async (transferId: number, errorMessage: string, maxRetries: number) => {
      const record = records.get(transferId);
      record.retryCount = Number(record.retryCount) + 1;
      record.errorMessage = errorMessage;
      if (Number(record.retryCount) > maxRetries) {
        record.status = SettlementTransactionStatus.FAILED;
      }
      return record;
    }),
    markSuccess: jest.fn().mockImplementation(async (transferId: number) => {
      const record = records.get(transferId);
      record.status = SettlementTransactionStatus.SUCCESS;
      return record;
    }),
  };
  const bankingClient = {
    getPendingTransfers: jest.fn().mockImplementation(
      async (batchSize: number, afterTransferId: number) => {
        const page = transfers
          .filter((transfer) => transfer.transferId > afterTransferId)
          .slice(0, batchSize);
        return {
          transfers: page,
          nextAfterTransferId:
            page[page.length - 1]?.transferId ?? afterTransferId,
        };
      },
    ),
    updateSettlementStatus: jest.fn().mockResolvedValue(true),
  };
  const configService = {
    get: jest.fn((_key: string, fallback: number | string) => _key === 'SETTLEMENT_RETRY_BASE_DELAY_MS' ? 0 : fallback),
  };
  const auditEvents: Array<Record<string, unknown>> = [];
  const auditLogService = new SettlementAuditLogService({
    insert: auditInsert ?? jest.fn().mockImplementation(async (event) => {
      auditEvents.push({ ...event });
    }),
  } as never);
  const scheduler = new SettlementScheduler(
    jobService as never,
    transactionService as never,
    bankingClient as never,
    configService as never,
    auditLogService,
  );
  return { scheduler, job, records, jobService, transactionService, bankingClient, auditEvents };
}

describe('SettlementScheduler', () => {
  it('processes the returned transfers in groups of 100 and updates job totals', async () => {
    const transfers = Array.from({ length: 101 }, (_, index) => ({ transferId: index + 1, amount: 10 }));
    const { scheduler, job, bankingClient } = createScheduler(transfers);

    await expect(scheduler.processSettlement(17)).resolves.toBe(job);

    expect(bankingClient.getPendingTransfers).toHaveBeenNthCalledWith(1, 100, 0);
    expect(bankingClient.getPendingTransfers).toHaveBeenNthCalledWith(2, 100, 100);
    expect(bankingClient.updateSettlementStatus).toHaveBeenCalledTimes(101);
    expect(job).toMatchObject({
      status: 'COMPLETED',
      totalTransactions: 101,
      successfulTransactions: 101,
      failedTransactions: 0,
    });
  });

  it('retries transient Banking Service errors and succeeds without duplicating records', async () => {
    const { scheduler, job, transactionService, bankingClient, auditEvents } = createScheduler([
      { transferId: 99, amount: 12.5 },
    ]);
    bankingClient.updateSettlementStatus
      .mockRejectedValueOnce(new Error('temporary'))
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce(true);

    await scheduler.processSettlement(17);

    expect(bankingClient.updateSettlementStatus).toHaveBeenCalledTimes(3);
    expect(transactionService.createIfMissing).toHaveBeenCalledTimes(1);
    expect(transactionService.recordRetryFailure).toHaveBeenCalledTimes(2);
    expect(job.status).toBe('COMPLETED');
    expect(job.successfulTransactions).toBe(1);
    expect(auditEvents.filter((event) => event.action === 'TRANSACTION_ATTEMPT_FAILED')).toHaveLength(2);
    expect(auditEvents.filter((event) => event.action === 'RETRY_ATTEMPTED')).toHaveLength(2);
    expect(auditEvents.filter((event) => event.action === 'TRANSACTION_SETTLED')).toHaveLength(1);
    expect(auditEvents.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        'PROCESSING_STARTED',
        'TRANSACTION_PROCESSING_STARTED',
        'JOB_COMPLETED',
      ]),
    );
  });

  it('does not resubmit a transfer already recorded as successful', async () => {
    const { scheduler, job, records, bankingClient } = createScheduler([
      { transferId: 99, amount: 12.5 },
    ]);
    records.set(99, { status: SettlementTransactionStatus.SUCCESS, retryCount: 0 });

    await scheduler.processSettlement(17);

    expect(bankingClient.updateSettlementStatus).not.toHaveBeenCalled();
    expect(job).toMatchObject({ status: 'COMPLETED', totalTransactions: 1, successfulTransactions: 1 });
  });

  it('marks the transaction and job failed after the initial attempt and three retries fail', async () => {
    const { scheduler, job, records, bankingClient, auditEvents } = createScheduler([
      { transferId: 99, amount: 12.5 },
    ]);
    bankingClient.updateSettlementStatus.mockRejectedValue(new Error('banking unavailable'));

    await scheduler.processSettlement(17);

    expect(bankingClient.updateSettlementStatus).toHaveBeenCalledTimes(4);
    expect(records.get(99)).toMatchObject({ status: SettlementTransactionStatus.FAILED, retryCount: 4 });
    expect(job).toMatchObject({
      status: 'FAILED',
      totalTransactions: 1,
      successfulTransactions: 0,
      failedTransactions: 1,
    });
    expect(auditEvents.filter((event) => event.action === 'TRANSACTION_ATTEMPT_FAILED')).toHaveLength(4);
    expect(auditEvents.filter((event) => event.action === 'RETRY_ATTEMPTED')).toHaveLength(3);
    expect(auditEvents).toContainEqual(
      expect.objectContaining({
        action: 'TRANSACTION_PERMANENTLY_FAILED',
        status: 'FAILED',
        transferId: 99,
        errorMessage: 'banking unavailable',
      }),
    );
    expect(auditEvents).toContainEqual(
      expect.objectContaining({ action: 'JOB_COMPLETED', status: 'FAILED' }),
    );
  });

  it('does not retry financial processing when audit persistence fails', async () => {
    const failingInsert = jest.fn().mockRejectedValue(new Error('audit database unavailable'));
    const { scheduler, job, bankingClient } = createScheduler(
      [{ transferId: 99, amount: 12.5 }],
      failingInsert,
    );

    await scheduler.processSettlement(17);

    expect(bankingClient.updateSettlementStatus).toHaveBeenCalledTimes(1);
    expect(job.status).toBe('COMPLETED');
    expect(failingInsert).toHaveBeenCalled();
  });

  it('marks the job failed and propagates errors fetching pending transfers', async () => {
    const { scheduler, job, bankingClient } = createScheduler([]);
    bankingClient.getPendingTransfers.mockRejectedValue(new Error('banking unavailable'));

    await expect(scheduler.processSettlement(17)).rejects.toThrow('banking unavailable');
    expect(job.status).toBe('FAILED');
  });
});
