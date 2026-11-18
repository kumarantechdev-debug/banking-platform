import { Inject, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, type Observable } from 'rxjs';
import { STATEMENT_GRPC_CLIENT } from '../grpc/grpc-clients.module.js';
import {
  GenerateStatementDto,
  StatementTransactionsQueryDto,
} from './statements.dto.js';

export interface StatementRecord {
  id: number;
  accountId: number;
  fromDate: string;
  toDate: string;
  openingBalance: string;
  closingBalance: string;
  generatedAt: string;
  status: string;
  transactions: Array<{
    id: number;
    statementId: number;
    transferId: number;
    transactionDate: string;
    transactionType: string;
    amount: string;
    description: string;
    balanceAfter: string;
    isAccountOpening: boolean;
  }>;
}

export interface GenerateStatementResponse {
  statement: StatementRecord;
  success: boolean;
  message: string;
}

export interface ExportStatementFileResponse {
  fileName: string;
  contentType: string;
  content: Uint8Array;
}

export interface PaginatedStatementRecord extends StatementRecord {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface GetStatementResponse {
  statement?: StatementRecord;
  found: boolean;
}

interface GetStatementByIdWithTransactionsResponse {
  statement?: StatementRecord;
  found: boolean;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface StatementGrpcClient {
  generateStatement(
    request: GenerateStatementDto,
  ): Observable<GenerateStatementResponse>;
  getStatement(request: {
    statementId: number;
  }): Observable<GetStatementResponse>;
  getStatementByIdWithTransactions(request: {
    statementId: number;
    transactionType?: string;
    fromDate?: string;
    toDate?: string;
    page: number;
    limit: number;
    paginate: boolean;
  }): Observable<GetStatementByIdWithTransactionsResponse>;
  exportStatementCsv(request: {
    statementId: number;
  }): Observable<ExportStatementFileResponse>;
  exportStatementPdf(request: {
    statementId: number;
  }): Observable<ExportStatementFileResponse>;
}

@Injectable()
export class StatementsService implements OnModuleInit {
  private statements!: StatementGrpcClient;

  constructor(
    @Inject(STATEMENT_GRPC_CLIENT) private readonly client: ClientGrpc,
  ) {}

  onModuleInit(): void {
    this.statements =
      this.client.getService<StatementGrpcClient>('StatementService');
  }

  generate(dto: GenerateStatementDto): Promise<GenerateStatementResponse> {
    return firstValueFrom(this.statements.generateStatement(dto));
  }

  exportCsv(statementId: number): Promise<ExportStatementFileResponse> {
    return firstValueFrom(
      this.statements.exportStatementCsv({ statementId }),
    );
  }

  exportPdf(statementId: number): Promise<ExportStatementFileResponse> {
    return firstValueFrom(
      this.statements.exportStatementPdf({ statementId }),
    );
  }

  async getById(
    statementId: number,
    query: StatementTransactionsQueryDto = {},
  ): Promise<PaginatedStatementRecord> {
    const hasQueryOptions =
      query.transactionType !== undefined ||
      query.fromDate !== undefined ||
      query.toDate !== undefined ||
      query.page !== undefined ||
      query.limit !== undefined;
    const response = await firstValueFrom(
      this.statements.getStatementByIdWithTransactions({
        statementId,
        transactionType: query.transactionType,
        fromDate: query.fromDate,
        toDate: query.toDate,
        page: query.page ?? 1,
        limit: query.limit ?? 10,
        paginate: hasQueryOptions,
      }),
    );
    if (!response.found || !response.statement) {
      throw new NotFoundException(`Statement ${statementId} was not found`);
    }
    return {
      ...response.statement,
      total: response.total,
      page: response.page,
      limit: response.limit,
      totalPages: response.totalPages,
    };
  }
}
