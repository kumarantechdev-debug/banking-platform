jest.mock('@nestjs/common', () => ({
  Controller: () => (target: unknown) => target,
  Logger: class {
    log() {}
    warn() {}
    error() {}
  },
}));

jest.mock('@nestjs/microservices', () => ({
  GrpcMethod: () => (target: unknown, key: string) => target,
  RpcException: class extends Error {
    code: number;

    constructor(info: { code: number; message: string }) {
      super(info.message);
      this.code = info.code;
    }
  },
}));

jest.mock('../settlement-job/settlement-job.service', () => ({
  SettlementJobService: class {},
}));

jest.mock('../settlement-transaction/settlement-transaction.service', () => ({
  SettlementTransactionService: class {},
}));

jest.mock('../scheduler/settlement.scheduler', () => ({
  SettlementScheduler: class {},
}));

jest.mock('../reports/failure-report.service', () => ({
  FailureReportService: class {},
}));

const { SettlementGrpcController } = require('./settlement.grpc.controller');

describe('SettlementGrpcController', () => {
  let controller: SettlementGrpcController;
  let jobService: any;
  let transactionService: any;
  let scheduler: any;
  let failureReportService: any;

  beforeEach(() => {
    jobService = {
      createJob: jest.fn().mockResolvedValue({
        id: 8,
        jobDate: '2024-01-15',
        status: 'PENDING',
        totalTransactions: 0,
        successfulTransactions: 0,
        failedTransactions: 0,
        createdAt: new Date('2024-01-15T00:00:00.000Z'),
      }),
      findById: jest.fn().mockResolvedValue({
        id: 2,
        jobDate: new Date('2024-01-15T00:00:00.000Z'),
        status: 'COMPLETED',
        totalTransactions: 5,
        successfulTransactions: 4,
        failedTransactions: 1,
        startedAt: new Date('2024-01-15T01:00:00.000Z'),
        completedAt: new Date('2024-01-15T02:00:00.000Z'),
        createdAt: new Date('2024-01-15T00:30:00.000Z'),
      }),
    };

    transactionService = {
      listByJob: jest.fn().mockResolvedValue([
        {
          id: 1,
          transferId: 99,
          amount: '50.00',
          status: 'SUCCESS',
          retryCount: 0,
          errorMessage: null,
          nextRetryAt: null,
          processedAt: new Date('2024-01-15T01:10:00.000Z'),
          createdAt: new Date('2024-01-15T01:00:00.000Z'),
          updatedAt: new Date('2024-01-15T01:10:00.000Z'),
        },
      ]),
    };

    scheduler = {
      processSettlement: jest.fn().mockResolvedValue({
        id: 2,
        jobDate: new Date('2024-01-15T00:00:00.000Z'),
        status: 'COMPLETED',
        totalTransactions: 5,
        successfulTransactions: 4,
        failedTransactions: 1,
        startedAt: new Date('2024-01-15T01:00:00.000Z'),
        completedAt: new Date('2024-01-15T02:00:00.000Z'),
        createdAt: new Date('2024-01-15T00:30:00.000Z'),
      }),
    };

    failureReportService = {
      generateReport: jest.fn().mockResolvedValue([
        {
          id: 2,
          jobId: 2,
          transferId: 100,
          amount: '10.00',
          status: 'FAILED',
          retryCount: 4,
          errorMessage: 'Banking unavailable',
          processedAt: new Date('2024-01-15T03:00:00.000Z'),
          createdAt: new Date('2024-01-15T02:00:00.000Z'),
          updatedAt: new Date('2024-01-15T03:00:00.000Z'),
        },
      ]),
    };

    controller = new SettlementGrpcController(jobService, transactionService, scheduler, failureReportService);
  });

  it('creates a settlement job and returns its generated id', async () => {
    const result = await controller.createSettlement({ jobDate: '2024-01-15' });
    expect(jobService.createJob).toHaveBeenCalledWith('2024-01-15');
    expect(result).toEqual({
      jobId: 8,
      jobDate: '2024-01-15',
      status: 'PENDING',
      message: 'Settlement job created successfully.',
    });
  });

  it('processes an existing settlement job', async () => {
    const result = await controller.processSettlement({ jobId: 2 });
    expect(scheduler.processSettlement).toHaveBeenCalledWith(2);
    expect(result.job.id).toBe(2);
  });

  it('returns a settlement job by id', async () => {
    const result = await controller.getSettlementJob({ jobId: 2 });
    expect(result.job.id).toBe(2);
    expect(result.job.status).toBe('COMPLETED');
  });

  it('returns a failure-only report and the matching failed count', async () => {
    const transactionsResult = await controller.getSettlementTransactions({ jobId: 2, limit: 20 });
    expect(transactionsResult.transactions).toHaveLength(1);

    const report = await controller.getSettlementReport({ jobId: 2 });
    expect(report.job).toMatchObject({
      totalTransactions: 5,
      successfulTransactions: 4,
      failedTransactions: 1,
    });
    expect(report.totalFailedTransactions).toBe(1);
    expect(report.failedTransactions).toHaveLength(1);
    expect(report.failedTransactions[0]).toMatchObject({
      id: 2,
      transferId: 100,
      amount: '10.00',
      status: 'FAILED',
      retryCount: 4,
      errorMessage: 'Banking unavailable',
      processedAt: '2024-01-15T03:00:00.000Z',
      createdAt: '2024-01-15T02:00:00.000Z',
    });
    expect(report.failedTransactions.every((transaction) => transaction.status === 'FAILED')).toBe(true);
    expect(failureReportService.generateReport).toHaveBeenCalledWith(2);
  });

  it('returns an empty failed transactions array and zero count when there are no failures', async () => {
    failureReportService.generateReport.mockResolvedValue([]);

    const report = await controller.getSettlementReport({ jobId: 2 });

    expect(report.failedTransactions).toEqual([]);
    expect(report.totalFailedTransactions).toBe(0);
  });
});
