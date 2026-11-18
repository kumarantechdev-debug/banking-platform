import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { StatementService } from './statement.service';

@Controller()
export class StatementGrpcService {
  constructor(private readonly statementService: StatementService) {}

  @GrpcMethod('StatementService', 'GenerateStatement')
  async generateStatement(data: { accountId: number; fromDate: string; toDate: string }) {
    return this.statementService.generateStatement(data);
  }

  @GrpcMethod('StatementService', 'GetStatement')
  async getStatement(data: { statementId: number }) {
    return this.statementService.getStatement(data.statementId);
  }

  @GrpcMethod('StatementService', 'GetStatementByIdWithTransactions')
  async getStatementByIdWithTransactions(data: {
    statementId: number;
    transactionType?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    limit?: number;
    paginate?: boolean;
  }) {
    return this.statementService.getStatementByIdWithTransactions(data);
  }

  @GrpcMethod('StatementService', 'GetStatementTransactions')
  async getStatementTransactions(data: {
    accountId: number;
    fromDate: string;
    toDate: string;
    transactionType?: string;
    page?: number;
    limit?: number;
  }) {
    return this.statementService.getStatementTransactions(data);
  }

  @GrpcMethod('StatementService', 'ExportStatementCsv')
  async exportStatementCsv(data: { statementId: number }) {
    const file = await this.statementService.exportStatementCsv(data.statementId);
    return {
      fileName: file.fileName,
      contentType: file.contentType,
      content: file.content,
    };
  }

  @GrpcMethod('StatementService', 'ExportStatementPdf')
  async exportStatementPdf(data: { statementId: number }) {
    const file = await this.statementService.exportStatementPdf(data.statementId);
    return {
      fileName: file.fileName,
      contentType: file.contentType,
      content: file.content,
    };
  }
}
