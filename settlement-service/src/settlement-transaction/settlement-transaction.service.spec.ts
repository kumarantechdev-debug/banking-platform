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

import { SettlementTransactionService, SettlementTransactionStatus } from './settlement-transaction.service';
import { SettlementTransaction } from './entities/settlement-transaction.entity';

describe('SettlementTransactionService', () => {
  let service: SettlementTransactionService;
  let repository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    createQueryBuilder: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(() => {
    repository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
      update: jest.fn(),
    };
    service = new SettlementTransactionService(repository as any);
  });

  it('creates a new settlement transaction successfully', async () => {
    const record = {
      id: 1,
      transferId: 100,
      amount: '150.00',
      status: SettlementTransactionStatus.PENDING,
      retryCount: 0,
      errorMessage: null,
      nextRetryAt: null,
      processedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as SettlementTransaction;

    repository.findOne.mockResolvedValue(null);
    repository.create.mockReturnValue(record);
    repository.save.mockResolvedValue(record);

    await expect(
      service.createIfMissing({
        transferId: 100,
        amount: '150.00',
        status: SettlementTransactionStatus.PENDING,
      }),
    ).resolves.toEqual(record);
  });

  it('prevents duplicate settlement transactions for the same transfer', async () => {
    repository.findOne.mockResolvedValue({ id: 10, transferId: 22 });

    await expect(
      service.createIfMissing({ transferId: 22, amount: '200.00' }),
    ).rejects.toThrow('already exists');
  });

  it('claims a pending transfer atomically and rejects a second claim', async () => {
    repository.update.mockResolvedValueOnce({ affected: 1 }).mockResolvedValueOnce({ affected: 0 });

    await expect(service.claimForProcessing(42, 7)).resolves.toBe(true);
    await expect(service.claimForProcessing(42, 8)).resolves.toBe(false);
    expect(repository.update).toHaveBeenNthCalledWith(
      1,
      { transferId: 42, status: SettlementTransactionStatus.PENDING },
      expect.objectContaining({ status: SettlementTransactionStatus.PROCESSING, jobId: 7 }),
    );
  });

  it('schedules a first retry and increments the retry count', async () => {
    const record = {
      id: 11,
      transferId: 42,
      amount: '20.00',
      status: SettlementTransactionStatus.PENDING,
      retryCount: 0,
      errorMessage: null,
      nextRetryAt: null,
      processedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as SettlementTransaction;

    repository.findOne.mockResolvedValue(record);
    repository.save.mockImplementation((entity) => Promise.resolve({ ...entity, retryCount: 1, status: 'PENDING', nextRetryAt: new Date() }));

    const updated = await service.markFailure(42, 'Temporary issue', 3);

    expect(updated?.retryCount).toBe(1);
    expect(updated?.status).toBe('PENDING');
    expect(updated?.nextRetryAt).toBeTruthy();
  });

  it('marks a transaction as failed when max retries are exhausted', async () => {
    const record = {
      id: 12,
      transferId: 124,
      amount: '30.00',
      status: SettlementTransactionStatus.PENDING,
      retryCount: 3,
      errorMessage: null,
      nextRetryAt: null,
      processedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as SettlementTransaction;

    repository.findOne.mockResolvedValue(record);
    repository.save.mockImplementation((entity) => Promise.resolve({ ...entity, retryCount: 4, status: 'FAILED' }));

    const updated = await service.markFailure(124, 'Gateway timeout', 3);

    expect(updated?.status).toBe('FAILED');
    expect(updated?.retryCount).toBe(4);
  });

  it('keeps a transfer claimed during retries and fails after three retries', async () => {
    const record = {
      id: 12,
      transferId: 124,
      amount: '30.00',
      status: SettlementTransactionStatus.PROCESSING,
      retryCount: 0,
      errorMessage: null,
      nextRetryAt: null,
      processedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as SettlementTransaction;
    repository.findOne.mockResolvedValue(record);
    repository.save.mockImplementation((entity) => Promise.resolve({ ...entity }));

    const first = await service.recordRetryFailure(124, 'Temporary failure', 3);
    expect(first?.status).toBe(SettlementTransactionStatus.PROCESSING);
    expect(first?.retryCount).toBe(1);

    record.retryCount = 3;
    const final = await service.recordRetryFailure(124, 'Still failing', 3);
    expect(final?.status).toBe(SettlementTransactionStatus.FAILED);
    expect(final?.retryCount).toBe(4);
  });

  it('calculates an exponential backoff delay', () => {
    expect(service.calculateRetryDelay(1, 60000)).toBe(60000);
    expect(service.calculateRetryDelay(2, 60000)).toBe(120000);
    expect(service.calculateRetryDelay(3, 60000)).toBe(240000);
  });

  it('recovers stale processing records', async () => {
    const stale = [{ id: 1, status: 'PROCESSING', updatedAt: new Date(Date.now() - 1000 * 60 * 60) }];
    repository.find.mockResolvedValue(stale);
    repository.save.mockImplementation((entity) => Promise.resolve(entity));

    const recovered = await service.recoverStaleProcessingRecords(30);

    expect(recovered).toBe(1);
    expect(repository.save).toHaveBeenCalled();
  });
});
