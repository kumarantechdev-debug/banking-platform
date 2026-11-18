import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { GetTransferDto } from './dto/get-transfer.dto';
import { GetAccountTransactionHistoryDto } from './get-account-transaction-history.dto';
import { Transfer } from './transfer.entity';
import { TransfersService } from './transfers.service';
import type {
  GetPendingTransfersInput,
  UpdateTransferSettlementStatusInput,
} from './transfers.service';
import { AccountTransactionHistoryService } from './account-transaction-history.service';

@Controller()
export class TransfersController {
  constructor(
    private readonly transfers: TransfersService,
    private readonly transactionHistory: AccountTransactionHistoryService,
  ) {}

  @GrpcMethod('BankingService', 'CreateTransfer')
  async createTransfer(request: CreateTransferDto) {
    return this.toResponse(await this.transfers.createTransfer(request));
  }

  @GrpcMethod('BankingService', 'GetTransfer')
  async getTransfer(request: GetTransferDto) {
    return this.toResponse(await this.transfers.getTransfer(request));
  }

  @GrpcMethod('BankingService', 'GetAccountTransactionHistory')
  async getAccountTransactionHistory(
    request: GetAccountTransactionHistoryDto,
  ) {
    return this.transactionHistory.getAccountTransactionHistory(request);
  }

  @GrpcMethod('BankingService', 'GetPendingTransfers')
  async getPendingTransfers(request: GetPendingTransfersInput) {
    const page = await this.transfers.getPendingTransfers(request);
    return {
      transfers: page.transfers.map((transfer) => ({
          transferId: transfer.id,
          amount: transfer.amount,
          settlementStatus: transfer.settlementStatus,
          transferStatus: transfer.status,
        })),
      nextAfterTransferId: page.nextAfterTransferId,
    };
  }

  @GrpcMethod('BankingService', 'UpdateTransferSettlementStatus')
  async updateTransferSettlementStatus(
    request: UpdateTransferSettlementStatusInput,
  ) {
    return this.transfers.updateTransferSettlementStatus(request);
  }

  private toResponse(transfer: Transfer) {
    return {
      id: transfer.id,
      fromAccountId: transfer.fromAccountId,
      toAccountId: transfer.toAccountId,
      amount: transfer.amount,
      status: transfer.status,
      referenceNumber: transfer.referenceNumber,
      createdAt: transfer.createdAt.toISOString(),
    };
  }
}
