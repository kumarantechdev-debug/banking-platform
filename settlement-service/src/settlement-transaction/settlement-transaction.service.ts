import { status } from '@grpc/grpc-js';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RpcException } from '@nestjs/microservices';
import { LessThanOrEqual, Repository } from 'typeorm';
import { SettlementTransaction } from './entities/settlement-transaction.entity';

export const SettlementTransactionStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const;

@Injectable()
export class SettlementTransactionService {
  private readonly logger = new Logger(SettlementTransactionService.name);

  constructor(
    @InjectRepository(SettlementTransaction)
    private readonly repository: Repository<SettlementTransaction>,
  ) {}

  async createIfMissing(input: Partial<SettlementTransaction>): Promise<SettlementTransaction> {
    if (input.transferId === undefined) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'A transferId is required to create a settlement transaction.',
      });
    }

    const existing = await this.repository.findOne({ where: { transferId: input.transferId } });
    if (existing) {
      throw new RpcException({
        code: status.ALREADY_EXISTS,
        message: `Settlement record already exists for transfer ${input.transferId}`,
      });
    }

    const transaction = this.repository.create({
      transferId: input.transferId,
      amount: input.amount ?? '0.00',
      status: input.status ?? SettlementTransactionStatus.PENDING,
      retryCount: input.retryCount ?? 0,
      errorMessage: input.errorMessage ?? null,
      nextRetryAt: input.nextRetryAt ?? null,
      processedAt: input.processedAt ?? null,
      jobId: input.jobId ?? null,
    });

    return this.repository.save(transaction);
  }

  async findByTransferId(transferId: number): Promise<SettlementTransaction | null> {
    return this.repository.findOne({ where: { transferId } });
  }

  async listByJob(jobId?: number, transferId?: number, status?: string, limit = 100): Promise<SettlementTransaction[]> {
    const qb = this.repository.createQueryBuilder('transaction');

    if (jobId !== undefined) {
      qb.andWhere('transaction.jobId = :jobId', { jobId });
    }

    if (transferId !== undefined) {
      qb.andWhere('transaction.transferId = :transferId', { transferId });
    }

    if (status) {
      qb.andWhere('transaction.status = :status', { status });
    }

    qb.orderBy('transaction.createdAt', 'DESC');
    qb.take(limit);

    return qb.getMany();
  }

  async listReportByJob(jobId: number): Promise<SettlementTransaction[]> {
    return this.repository
      .createQueryBuilder('transaction')
      .where('transaction.jobId = :jobId', { jobId })
      .andWhere('transaction.status IN (:...statuses)', {
        statuses: [SettlementTransactionStatus.SUCCESS, SettlementTransactionStatus.FAILED],
      })
      .orderBy('transaction.createdAt', 'ASC')
      .getMany();
  }

  async markProcessing(transferId: number, jobId?: number): Promise<SettlementTransaction> {
    const record = await this.findByTransferId(transferId);
    if (!record) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: `No settlement record exists for transfer ${transferId}`,
      });
    }

    record.status = SettlementTransactionStatus.PROCESSING;
    record.jobId = jobId ?? record.jobId ?? null;
    record.processedAt = new Date();
    return this.repository.save(record);
  }

  async claimForProcessing(transferId: number, jobId: number): Promise<boolean> {
    const result = await this.repository.update(
      { transferId, status: SettlementTransactionStatus.PENDING },
      {
        status: SettlementTransactionStatus.PROCESSING,
        jobId,
        processedAt: new Date(),
        nextRetryAt: null,
      },
    );
    return result.affected === 1;
  }

  async markSuccess(transferId: number): Promise<SettlementTransaction | null> {
    const record = await this.findByTransferId(transferId);
    if (!record) {
      return null;
    }

    record.status = SettlementTransactionStatus.SUCCESS;
    record.processedAt = new Date();
    record.errorMessage = null;
    record.nextRetryAt = null;
    return this.repository.save(record);
  }

  async markFailure(
    transferId: number,
    errorMessage: string,
    maxRetries = 3,
    jobId?: number,
  ): Promise<SettlementTransaction | null> {
    const record = await this.findByTransferId(transferId);
    if (!record) {
      return null;
    }

    const retryCount = record.retryCount + 1;
    record.retryCount = retryCount;
    record.jobId = jobId ?? record.jobId ?? null;
    record.errorMessage = errorMessage;

    if (retryCount > maxRetries) {
      record.status = SettlementTransactionStatus.FAILED;
      record.nextRetryAt = null;
      record.processedAt = new Date();
      this.logger.warn(`Settlement retries exhausted for transfer ${transferId}`);
      return this.repository.save(record);
    }

    record.status = SettlementTransactionStatus.PENDING;
    record.processedAt = new Date();
    record.nextRetryAt = this.calculateRetryAt(retryCount);
    return this.repository.save(record);
  }

  async recordRetryFailure(
    transferId: number,
    errorMessage: string,
    maxRetries = 3,
    jobId?: number,
  ): Promise<SettlementTransaction | null> {
    const record = await this.findByTransferId(transferId);
    if (!record) {
      return null;
    }

    record.retryCount += 1;
    record.jobId = jobId ?? record.jobId ?? null;
    record.errorMessage = errorMessage;
    record.processedAt = new Date();

    if (record.retryCount > maxRetries) {
      record.status = SettlementTransactionStatus.FAILED;
      record.nextRetryAt = null;
      this.logger.warn(`Settlement retries exhausted for transfer ${transferId}`);
    } else {
      record.status = SettlementTransactionStatus.PROCESSING;
      record.nextRetryAt = this.calculateRetryAt(record.retryCount);
    }

    return this.repository.save(record);
  }

  async getRetryCandidates(maxRetries = 3): Promise<SettlementTransaction[]> {
    return this.repository.find({
      where: {
        status: SettlementTransactionStatus.PENDING,
        retryCount: LessThanOrEqual(maxRetries),
      },
      order: { nextRetryAt: 'ASC' },
    });
  }

  async recoverStaleProcessingRecords(timeoutMinutes = 30): Promise<number> {
    const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000);
    const stale = await this.repository.find({
      where: {
        status: SettlementTransactionStatus.PROCESSING,
        updatedAt: LessThanOrEqual(cutoff),
      },
    });

    for (const record of stale) {
      record.status = SettlementTransactionStatus.PENDING;
      record.errorMessage = 'Recovered stale processing state';
      await this.repository.save(record);
    }

    return stale.length;
  }

  calculateRetryDelay(retryCount: number, baseDelayMs = 60000): number {
    return baseDelayMs * 2 ** Math.max(retryCount - 1, 0);
  }

  calculateRetryAt(retryCount: number, baseDelayMs = 60000): Date {
    return new Date(Date.now() + this.calculateRetryDelay(retryCount, baseDelayMs));
  }
}
