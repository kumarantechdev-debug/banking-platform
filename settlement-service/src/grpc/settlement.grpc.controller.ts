import { Controller, Logger } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { SettlementJobService } from '../settlement-job/settlement-job.service';
import { SettlementTransactionService } from '../settlement-transaction/settlement-transaction.service';
import { SettlementScheduler } from '../scheduler/settlement.scheduler';
import { SettlementJob } from '../settlement-job/entities/settlement-job.entity';
import { SettlementTransaction } from '../settlement-transaction/entities/settlement-transaction.entity';
import { FailureReportService } from '../reports/failure-report.service';

@Controller()
export class SettlementGrpcController {
  private readonly logger = new Logger(SettlementGrpcController.name);

  constructor(
    private readonly settlementJobService: SettlementJobService,
    private readonly settlementTransactionService: SettlementTransactionService,
    private readonly settlementScheduler: SettlementScheduler,
    private readonly failureReportService: FailureReportService,
  ) {}

  @GrpcMethod('SettlementService', 'CreateSettlement')
  async createSettlement(data: { jobDate?: string }): Promise<{
    jobId: number;
    jobDate: string;
    status: string;
    message: string;
  }> {
    if (!data?.jobDate) {
      throw new RpcException({ code: status.INVALID_ARGUMENT, message: 'jobDate is required.' });
    }

    const job = await this.settlementJobService.createJob(data.jobDate);
    return {
      jobId: job.id,
      jobDate: this.toDateString(job.jobDate),
      status: job.status,
      message: 'Settlement job created successfully.',
    };
  }

  @GrpcMethod('SettlementService', 'ProcessSettlement')
  async processSettlement(data: { jobId?: number }): Promise<{ job: Record<string, unknown> }> {
    if (!data?.jobId) {
      throw new RpcException({ code: status.INVALID_ARGUMENT, message: 'jobId is required.' });
    }

    const job = await this.settlementScheduler.processSettlement(data.jobId);
    return { job: this.toGrpcJob(job) };
  }

  @GrpcMethod('SettlementService', 'GetSettlementJob')
  async getSettlementJob(data: { jobId?: number }): Promise<{ job: Record<string, unknown> }> {
    if (!data?.jobId) {
      throw new RpcException({ code: status.INVALID_ARGUMENT, message: 'jobId is required.' });
    }

    const job = await this.settlementJobService.findById(data.jobId);
    if (!job) {
      throw new RpcException({ code: status.NOT_FOUND, message: `Settlement job ${data.jobId} not found.` });
    }

    return { job: this.toGrpcJob(job) };
  }

  @GrpcMethod('SettlementService', 'GetSettlementTransactions')
  async getSettlementTransactions(data: {
    jobId: number;
    transferId?: number;
    status?: string;
    limit?: number;
  }): Promise<{ transactions: Record<string, unknown>[] }> {
    if (!data?.jobId) {
      throw new RpcException({ code: status.INVALID_ARGUMENT, message: 'jobId is required.' });
    }

    const transactions = await this.settlementTransactionService.listByJob(
      data.jobId,
      data?.transferId,
      data?.status,
      data?.limit ?? 100,
    );

    return { transactions: transactions.map((transaction) => this.toGrpcTransaction(transaction)) };
  }

  @GrpcMethod('SettlementService', 'GetSettlementReport')
  async getSettlementReport(data: { jobId?: number }): Promise<{
    job: Record<string, unknown>;
    failedTransactions: Record<string, unknown>[];
    totalFailedTransactions: number;
  }> {
    if (!data?.jobId) {
      throw new RpcException({ code: status.INVALID_ARGUMENT, message: 'jobId is required.' });
    }

    const job = await this.settlementJobService.findById(data.jobId);
    if (!job) {
      throw new RpcException({ code: status.NOT_FOUND, message: `Settlement job ${data.jobId} not found.` });
    }

    const failedTransactions = await this.failureReportService.generateReport(data.jobId);
    return {
      job: this.toGrpcJob(job),
      failedTransactions: failedTransactions.map((transaction) => this.toGrpcTransaction(transaction)),
      totalFailedTransactions: failedTransactions.length,
    };
  }

  private toGrpcJob(job: SettlementJob): Record<string, unknown> {
    return {
      id: job.id,
      jobDate: job.jobDate ? this.toDateString(job.jobDate) : '',
      status: job.status,
      totalTransactions: job.totalTransactions,
      successfulTransactions: job.successfulTransactions,
      failedTransactions: job.failedTransactions,
      startedAt: job.startedAt ? job.startedAt.toISOString() : '',
      completedAt: job.completedAt ? job.completedAt.toISOString() : '',
      createdAt: job.createdAt ? job.createdAt.toISOString() : '',
    };
  }

  private toDateString(date: Date | string): string {
    if (typeof date === 'string') {
      const dateOnly = /^(\d{4}-\d{2}-\d{2})(?:$|T)/.exec(date);
      if (dateOnly) {
        return dateOnly[1];
      }
      date = new Date(date);
    }

    if (Number.isNaN(date.getTime())) {
      throw new Error('Settlement job contains an invalid jobDate.');
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private toGrpcTransaction(transaction: SettlementTransaction): Record<string, unknown> {
    return {
      id: transaction.id,
      transferId: transaction.transferId,
      amount: transaction.amount,
      status: transaction.status,
      retryCount: transaction.retryCount,
      errorMessage: transaction.errorMessage ?? '',
      nextRetryAt: transaction.nextRetryAt ? transaction.nextRetryAt.toISOString() : '',
      processedAt: transaction.processedAt ? transaction.processedAt.toISOString() : '',
      createdAt: transaction.createdAt ? transaction.createdAt.toISOString() : '',
      updatedAt: transaction.updatedAt ? transaction.updatedAt.toISOString() : '',
    };
  }
}
