jest.mock('@nestjs/common', () => ({
  Injectable: () => (target: unknown) => target,
  Logger: class {
    log() {}
    warn() {}
    error() {}
  },
}));

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
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

import { SettlementJobService } from './settlement-job.service';
import { SettlementJob } from './entities/settlement-job.entity';

describe('SettlementJobService', () => {
  let service: SettlementJobService;
  let repository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let auditLogService: { record: jest.Mock };

  beforeEach(() => {
    repository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    auditLogService = { record: jest.fn().mockResolvedValue(undefined) };
    service = new SettlementJobService(repository as any, auditLogService as never);
  });

  it('starts a job successfully', async () => {
    const date = new Date('2024-01-15T00:00:00.000Z');
    const job = {
      id: 1,
      jobDate: date,
      status: 'PENDING',
      totalTransactions: 0,
      successfulTransactions: 0,
      failedTransactions: 0,
      startedAt: new Date(),
      createdAt: new Date(),
    } as SettlementJob;

    repository.findOne.mockResolvedValue(null);
    repository.create.mockReturnValue(job);
    repository.save.mockResolvedValue(job);

    await expect(service.startJob(date)).resolves.toEqual(job);
    expect(repository.create).toHaveBeenCalled();
  });

  it('creates a pending job without providing its auto-generated id', async () => {
    const date = new Date('2024-01-15T00:00:00.000Z');
    const job = {
      id: 21,
      jobDate: date,
      status: 'PENDING',
      totalTransactions: 0,
      successfulTransactions: 0,
      failedTransactions: 0,
    } as SettlementJob;

    repository.findOne.mockResolvedValue(null);
    repository.create.mockImplementation((input) => ({ id: 21, ...input }));
    repository.save.mockResolvedValue(job);

    await expect(service.createJob(date)).resolves.toEqual(job);
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 21,
        action: 'JOB_CREATED',
        status: 'PENDING',
      }),
    );
    expect(repository.create).toHaveBeenCalledWith({
      jobDate: expect.any(Date),
      status: 'PENDING',
      totalTransactions: 0,
      successfulTransactions: 0,
      failedTransactions: 0,
    });
  });

  it('prevents duplicate daily jobs', async () => {
    const date = new Date('2024-01-15T00:00:00.000Z');
    repository.findOne.mockResolvedValue({ id: 99, jobDate: date });

    await expect(service.startJob(date)).rejects.toThrow('Settlement job already exists');
  });

  it('updates the job summary after completion', async () => {
    const date = new Date('2024-01-15T00:00:00.000Z');
    const existingJob = {
      id: 7,
      jobDate: date,
      status: 'PENDING',
      totalTransactions: 0,
      successfulTransactions: 0,
      failedTransactions: 0,
      startedAt: new Date(),
      createdAt: new Date(),
    } as SettlementJob;

    repository.findOne.mockResolvedValue(existingJob);
    repository.save.mockImplementation((entity) => Promise.resolve({ ...entity, status: 'COMPLETED' }));

    const current = await service.updateSummary(7, {
      status: 'COMPLETED',
      totalTransactions: 10,
      successfulTransactions: 9,
      failedTransactions: 1,
    });

    expect(current?.status).toBe('COMPLETED');
    expect(current?.failedTransactions).toBe(1);
  });
});
