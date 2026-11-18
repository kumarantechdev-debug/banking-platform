import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, type Observable } from 'rxjs';
import { BANKING_GRPC_CLIENT } from '../grpc/grpc-clients.module.js';
import { CreateAccountDto, CreateTransferDto } from './banking.dto.js';

export interface AccountResponse {
  id: number;
  accountNumber: string;
  customerId: number;
  balance: string;
  status: string;
  createdAt: string;
}

export interface TransferResponse {
  id: number;
  fromAccountId: number;
  toAccountId: number;
  amount: string;
  status: string;
  referenceNumber: string;
  createdAt: string;
}

interface BankingGrpcClient {
  createAccount(request: CreateAccountDto): Observable<AccountResponse>;
  getAccount(request: { accountId: number }): Observable<AccountResponse>;
  createTransfer(request: CreateTransferDto): Observable<TransferResponse>;
  getTransfer(request: { transferId: number }): Observable<TransferResponse>;
}

@Injectable()
export class BankingService implements OnModuleInit {
  private banking!: BankingGrpcClient;

  constructor(
    @Inject(BANKING_GRPC_CLIENT) private readonly client: ClientGrpc,
  ) {}

  onModuleInit(): void {
    this.banking = this.client.getService<BankingGrpcClient>('BankingService');
  }

  createAccount(dto: CreateAccountDto): Promise<AccountResponse> {
    return firstValueFrom(this.banking.createAccount(dto));
  }

  getAccount(accountId: number): Promise<AccountResponse> {
    return firstValueFrom(this.banking.getAccount({ accountId }));
  }

  createTransfer(dto: CreateTransferDto): Promise<TransferResponse> {
    return firstValueFrom(this.banking.createTransfer(dto));
  }

  getTransfer(transferId: number): Promise<TransferResponse> {
    return firstValueFrom(this.banking.getTransfer({ transferId }));
  }
}
