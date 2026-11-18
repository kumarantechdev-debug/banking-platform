import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { type ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom, type Observable } from 'rxjs';

export interface PendingTransfer {
  transferId: number;
  amount: string;
  settlementStatus: string;
  transferStatus: string;
}

interface BankingServiceClient {
  getPendingTransfers(data: {
    batchSize: number;
    status: string;
    afterTransferId: number;
  }): Observable<{ transfers: PendingTransfer[]; nextAfterTransferId: number }>;
  updateTransferSettlementStatus(data: {
    transferId: number;
    settlementStatus: string;
  }): Observable<{ success: boolean; message: string }>;
}

@Injectable()
export class BankingClientService implements OnModuleInit {
  private readonly logger = new Logger(BankingClientService.name);
  private bankingServiceClient!: BankingServiceClient;

  constructor(@Inject('BANKING_SERVICE') private readonly client: ClientGrpc) {}

  onModuleInit(): void {
    this.bankingServiceClient = this.client.getService<BankingServiceClient>('BankingService');
  }

  async getPendingTransfers(
    batchSize = 100,
    afterTransferId = 0,
  ): Promise<{ transfers: PendingTransfer[]; nextAfterTransferId: number }> {
    try {
      const response = await lastValueFrom(
        this.bankingServiceClient.getPendingTransfers({
          batchSize,
          status: 'PENDING',
          afterTransferId,
        }),
      );
      if (
        !Array.isArray(response?.transfers) ||
        !Number.isInteger(response.nextAfterTransferId) ||
        (response.transfers.length > 0 && response.nextAfterTransferId <= afterTransferId)
      ) {
        throw new Error('Banking service returned an invalid pending-transfers response.');
      }
      return response;
    } catch (error) {
      this.logger.error('Banking service unavailable while fetching pending transfers', error as Error);
      throw error;
    }
  }

  async updateSettlementStatus(transferId: number, settlementStatus: string): Promise<boolean> {
    try {
      const response = await lastValueFrom(
        this.bankingServiceClient.updateTransferSettlementStatus({
          transferId,
          settlementStatus,
        }),
      );
      return response.success === true;
    } catch (error) {
      this.logger.error(`Banking service unavailable while updating transfer ${transferId}`, error as Error);
      throw error;
    }
  }
}
