import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { BankingClientService } from '../banking-client/banking-client.service';
import {
  SettlementAuditAction,
  SettlementAuditLogService,
} from '../settlement-audit-log/settlement-audit-log.service';
import { SettlementJob } from '../settlement-job/entities/settlement-job.entity';
import { SettlementJobService } from '../settlement-job/settlement-job.service';
import {
  SettlementTransactionService,
  SettlementTransactionStatus,
} from '../settlement-transaction/settlement-transaction.service';

const SETTLEMENT_BATCH_SIZE = 100;
const MAX_RETRIES = 3;

@Injectable()
export class SettlementScheduler {
  private readonly logger = new Logger(SettlementScheduler.name);

  constructor(
    private readonly settlementJobService: SettlementJobService,
    private readonly settlementTransactionService: SettlementTransactionService,
    private readonly bankingClientService: BankingClientService,
    private readonly configService: ConfigService,
    private readonly auditLogService: SettlementAuditLogService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM, {
    name: 'dailySettlement',
    timeZone: 'Asia/Kolkata',
  })
  async handleDailySettlement(): Promise<void> {
    const timezone = this.configService.get<string>('SETTLEMENT_TIMEZONE', 'Asia/Kolkata');
    const jobDate = new Date();

    try {
      await this.runSettlement(jobDate, false, timezone);
    } catch (error) {
      this.logger.error('Daily settlement failed', error as Error);
    }
  }

  async triggerManualSettlement(jobDate?: Date | string): Promise<SettlementJob> {
    return this.runSettlement(
      jobDate ?? new Date(),
      true,
      this.configService.get<string>('SETTLEMENT_TIMEZONE', 'Asia/Kolkata'),
    );
  }

  async processSettlement(jobId: number): Promise<SettlementJob> {
    const job = await this.settlementJobService.findById(jobId);
    if (!job) {
      throw new RpcException({ code: status.NOT_FOUND, message: `Settlement job ${jobId} not found.` });
    }
    if (job.status === 'COMPLETED') {
      return job;
    }

    const startedJob = await this.settlementJobService.updateSummary(jobId, {
      status: 'PROCESSING',
      startedAt: job.startedAt ?? new Date(),
      completedAt: null,
    });
    if (!startedJob) {
      throw new RpcException({ code: status.INTERNAL, message: 'Settlement job could not be started.' });
    }
    await this.auditLogService.record({
      jobId,
      action: SettlementAuditAction.PROCESSING_STARTED,
      status: startedJob.status,
      description: 'Settlement processing started.',
    });

    let total = 0;
    let successful = 0;
    let failed = 0;

    try {
      let afterTransferId = 0;
      while (true) {
        const page = await this.bankingClientService.getPendingTransfers(
          SETTLEMENT_BATCH_SIZE,
          afterTransferId,
        );
        const transfers = page.transfers;
        this.logger.log(`Fetched ${transfers.length} pending transfers for settlement job ${jobId}`);

        for (const transfer of transfers) {
          const transferId = Number(transfer.transferId);
          if (!Number.isInteger(transferId) || transferId <= 0) {
            total += 1;
            failed += 1;
            this.logger.error('Banking service returned a transfer without a valid transferId.');
            continue;
          }

          const existing = await this.settlementTransactionService.findByTransferId(transferId);
          if (existing?.status === SettlementTransactionStatus.SUCCESS) {
            total += 1;
            successful += 1;
            continue;
          }
          if (
            existing?.status === SettlementTransactionStatus.FAILED ||
            existing?.status === SettlementTransactionStatus.PROCESSING
          ) {
            total += 1;
            failed += 1;
            continue;
          }

          total += 1;
          if (!existing) {
            await this.settlementTransactionService.createIfMissing({
              transferId,
              amount: String(transfer.amount),
              status: SettlementTransactionStatus.PENDING,
              jobId,
            });
          }

          const claimed = await this.settlementTransactionService.claimForProcessing(transferId, jobId);
          if (!claimed) {
            total -= 1;
            continue;
          }
          await this.auditLogService.record({
            jobId,
            transferId,
            action: SettlementAuditAction.TRANSACTION_PROCESSING_STARTED,
            status: SettlementTransactionStatus.PROCESSING,
            description: 'Transaction processing started.',
          });
          if (await this.settleTransferWithRetries(transferId, jobId)) {
            successful += 1;
          } else {
            failed += 1;
          }
        }

        if (transfers.length < SETTLEMENT_BATCH_SIZE) {
          break;
        }
        if (page.nextAfterTransferId <= afterTransferId) {
          throw new RpcException({
            code: status.INTERNAL,
            message: 'Banking Service returned a non-advancing transfer cursor.',
          });
        }
        afterTransferId = page.nextAfterTransferId;
      }
    } catch (error) {
      await this.finalizeJob(jobId, 'FAILED', total, successful, failed, error);
      throw error;
    }

    return this.finalizeJob(
      jobId,
      failed > 0 ? 'FAILED' : 'COMPLETED',
      total,
      successful,
      failed,
    );
  }

  private async runSettlement(
    jobDate: Date | string,
    manual: boolean,
    timezone: string,
  ): Promise<SettlementJob> {
    const normalizedDate = new Date(jobDate);

    try {
      const job = await this.settlementJobService.startJob(normalizedDate);
      this.logger.log(
        `Settlement job started for ${String(job.jobDate)} in timezone ${timezone} (manual=${manual})`,
      );
      return this.processSettlement(job.id);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === status.ALREADY_EXISTS) {
        const existingJob = await this.settlementJobService.findByDate(normalizedDate);
        if (existingJob) {
          this.logger.warn(`Duplicate settlement job suppressed for ${normalizedDate.toISOString()}`);
          return existingJob;
        }
      }
      throw error;
    }
  }

  private async finalizeJob(
    jobId: number,
    finalStatus: string,
    totalTransactions: number,
    successfulTransactions: number,
    failedTransactions: number,
    error?: unknown,
  ): Promise<SettlementJob> {
    const job = await this.settlementJobService.updateSummary(jobId, {
      status: finalStatus,
      totalTransactions,
      successfulTransactions,
      failedTransactions,
      completedAt: new Date(),
    });
    if (!job) {
      throw new RpcException({ code: status.INTERNAL, message: 'Settlement job could not be finalized.' });
    }
    await this.auditLogService.record({
      jobId,
      action: SettlementAuditAction.JOB_COMPLETED,
      status: job.status,
      description: `Settlement job ended with status ${job.status}.`,
      errorMessage: error === undefined ? null : this.describeError(error),
      errorDetails: error instanceof Error ? error.stack ?? error.message : error === undefined ? null : this.describeError(error),
    });
    return job;
  }

  private describeError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'A non-Error value was thrown during settlement processing.';
  }

  private async settleTransferWithRetries(transferId: number, jobId: number): Promise<boolean> {
    const baseDelayMs = this.configService.get<number>('SETTLEMENT_RETRY_BASE_DELAY_MS', 1000);

    for (let retry = 0; retry <= MAX_RETRIES; retry += 1) {
      if (retry > 0) {
        await this.auditLogService.record({
          jobId,
          transferId,
          action: SettlementAuditAction.RETRY_ATTEMPTED,
          status: SettlementTransactionStatus.PROCESSING,
          description: `Retry ${retry} of ${MAX_RETRIES} attempted.`,
        });
      }

      try {
        const success = await this.bankingClientService.updateSettlementStatus(
          transferId,
          'SETTLED',
        );
        if (!success) {
          throw new Error('Banking service reported unsuccessful settlement status.');
        }

        await this.settlementTransactionService.markSuccess(transferId);
        await this.auditLogService.record({
          jobId,
          transferId,
          action: SettlementAuditAction.TRANSACTION_SETTLED,
          status: SettlementTransactionStatus.SUCCESS,
          description: 'Transaction successfully settled.',
        });
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Settlement failed';
        const record = await this.settlementTransactionService.recordRetryFailure(
          transferId,
          message,
          MAX_RETRIES,
          jobId,
        );
        await this.auditLogService.record({
          jobId,
          transferId,
          action: SettlementAuditAction.TRANSACTION_ATTEMPT_FAILED,
          status: record?.status ?? SettlementTransactionStatus.PROCESSING,
          description: `Transaction attempt ${retry + 1} failed.`,
          errorMessage: message,
          errorDetails:
            error instanceof Error ? error.stack ?? error.message : String(error),
        });
        if (retry === MAX_RETRIES) {
          await this.auditLogService.record({
            jobId,
            transferId,
            action: SettlementAuditAction.TRANSACTION_PERMANENTLY_FAILED,
            status: SettlementTransactionStatus.FAILED,
            description: 'Transaction permanently failed after exhausting retries.',
            errorMessage: message,
            errorDetails:
              error instanceof Error ? error.stack ?? error.message : String(error),
          });
          this.logger.error(`Settlement failed for transfer ${transferId}`, error as Error);
          return false;
        }

        const retryCount = record?.retryCount ?? retry + 1;
        const delay = baseDelayMs * 2 ** Math.max(retryCount - 1, 0);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    return false;
  }
}
