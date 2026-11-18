jest.mock('@nestjs/common', () => ({
  Injectable: () => (target: unknown) => target,
  Logger: class {
    error() {}
  },
}));

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

import { SettlementAuditAction, SettlementAuditLogService } from './settlement-audit-log.service';

describe('SettlementAuditLogService', () => {
  it('appends new audit events without changing previous records', async () => {
    const previousRecord = Object.freeze({
      id: 1,
      jobId: 10,
      transferId: 22,
      action: SettlementAuditAction.TRANSACTION_SETTLED,
      status: 'SUCCESS',
      description: 'Previously settled.',
      errorMessage: null,
      errorDetails: null,
    });
    const records: Array<Record<string, unknown>> = [previousRecord];
    const repository = {
      insert: jest.fn().mockImplementation(async (event) => {
        records.push({ id: records.length + 1, ...event });
      }),
    };
    const service = new SettlementAuditLogService(repository as never);

    await service.record({
      jobId: 11,
      action: SettlementAuditAction.PROCESSING_STARTED,
      status: 'PROCESSING',
      description: 'Settlement processing started.',
    });

    expect(repository.insert).toHaveBeenCalledTimes(1);
    expect(records).toHaveLength(2);
    expect(records[0]).toBe(previousRecord);
    expect(records[0]).toEqual({
      id: 1,
      jobId: 10,
      transferId: 22,
      action: SettlementAuditAction.TRANSACTION_SETTLED,
      status: 'SUCCESS',
      description: 'Previously settled.',
      errorMessage: null,
      errorDetails: null,
    });
  });

  it('does not propagate an audit storage failure into settlement processing', async () => {
    const repository = { insert: jest.fn().mockRejectedValue(new Error('database unavailable')) };
    const service = new SettlementAuditLogService(repository as never);

    await expect(
      service.record({
        jobId: 11,
        action: SettlementAuditAction.JOB_CREATED,
        status: 'PENDING',
        description: 'Settlement job created.',
      }),
    ).resolves.toBeUndefined();

    expect(repository.insert).toHaveBeenCalledTimes(1);
  });
});
