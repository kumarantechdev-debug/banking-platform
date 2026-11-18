import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, type Observable } from 'rxjs';
import { SETTLEMENT_GRPC_CLIENT } from '../grpc/grpc-clients.module.js';
import { CreateSettlementDto } from './settlements.dto.js';

export interface SettlementJob {
  id: number;
  jobDate: string;
  status: string;
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  startedAt: string;
  completedAt: string;
  createdAt: string;
}

export interface SettlementTransaction {
  id: number;
  transferId: number;
  amount: string;
  status: string;
  retryCount: number;
  errorMessage: string;
  nextRetryAt: string;
  processedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface SettlementReport {
  job: SettlementJob;
  failureTransactions: SettlementTransaction[];
}

interface SettlementGrpcReport {
  job: SettlementJob;
  transactions: SettlementTransaction[];
}

interface SettlementGrpcClient {
  createSettlement(request: CreateSettlementDto): Observable<{
    jobId: number;
    jobDate: string;
    status: string;
    message: string;
  }>;
  processSettlement(request: { jobId: number }): Observable<{
    job: SettlementJob;
  }>;
  getSettlementJob(request: { jobId: number }): Observable<{
    job: SettlementJob;
  }>;
  getSettlementReport(
    request: { jobId: number },
  ): Observable<SettlementGrpcReport>;
}

@Injectable()
export class SettlementsService implements OnModuleInit {
  private settlements!: SettlementGrpcClient;

  constructor(
    @Inject(SETTLEMENT_GRPC_CLIENT) private readonly client: ClientGrpc,
  ) {}

  onModuleInit(): void {
    this.settlements =
      this.client.getService<SettlementGrpcClient>('SettlementService');
  }

  create(dto: CreateSettlementDto) {
    return firstValueFrom(this.settlements.createSettlement(dto));
  }

  process(jobId: number) {
    return firstValueFrom(this.settlements.processSettlement({ jobId }));
  }

  getById(jobId: number) {
    return firstValueFrom(this.settlements.getSettlementJob({ jobId }));
  }

  async getReport(jobId: number): Promise<SettlementReport> {
    const { transactions, ...report } = await firstValueFrom(
      this.settlements.getSettlementReport({ jobId }),
    );
    return { ...report, failureTransactions: transactions };
  }
}
