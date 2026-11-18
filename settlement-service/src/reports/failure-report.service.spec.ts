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

import { FailureReportService } from './failure-report.service';

describe('FailureReportService', () => {
  let service: FailureReportService;
  let repository: { find: jest.Mock };

  const transactions = [
    {
      id: 1,
      jobId: 25,
      transferId: 55,
      amount: '150.00',
      status: 'FAILED',
      retryCount: 4,
      errorMessage: 'Banking unavailable',
      processedAt: new Date('2024-01-15T07:00:00.000Z'),
      createdAt: new Date('2024-01-15T06:00:00.000Z'),
    },
    {
      id: 2,
      jobId: 25,
      transferId: 56,
      amount: '25.00',
      status: 'SUCCESS',
      retryCount: 0,
    },
    {
      id: 3,
      jobId: 25,
      transferId: 57,
      amount: '75.00',
      status: 'PROCESSING',
      retryCount: 1,
    },
    {
      id: 4,
      jobId: 26,
      transferId: 58,
      amount: '10.00',
      status: 'FAILED',
      retryCount: 4,
    },
  ];

  beforeEach(() => {
    repository = {
      find: jest.fn(({ where }) =>
        Promise.resolve(
          transactions.filter(
            (transaction) =>
              transaction.jobId === where.jobId && transaction.status === where.status,
          ),
        ),
      ),
    };
    service = new FailureReportService(repository as never);
  });

  it('includes only FAILED transactions for the requested job', async () => {
    const report = await service.generateReport(25);

    expect(repository.find).toHaveBeenCalledWith({
      where: { jobId: 25, status: 'FAILED' },
      order: { processedAt: 'DESC' },
    });
    expect(report.map((transaction) => transaction.id)).toEqual([1]);
    expect(report.every((transaction) => transaction.status === 'FAILED')).toBe(true);
  });

  it('returns an empty failed transactions array when there are no failures', async () => {
    repository.find.mockResolvedValue([]);

    await expect(service.generateReport(25)).resolves.toEqual([]);
  });
});
