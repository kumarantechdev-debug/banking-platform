import { status } from '@grpc/grpc-js';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientGrpc, ClientProxyFactory, RpcException, Transport } from '@nestjs/microservices';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { lastValueFrom, Observable } from 'rxjs';
import type {
  BankingAccount,
  BankingTransaction,
  BankingTransactionHistory,
} from '../statement/statement.types';

interface BankingGrpcService {
  getAccount(request: { accountId: number }): Observable<unknown>;
  getAccountTransactionHistory(request: {
    accountId: number;
    fromDate: string;
    toDate: string;
    page: number;
    limit: number;
    snapshotAt: string;
  }): Observable<unknown>;
}

interface HistoryPage {
  transactions: unknown[];
  openingBalance: string;
  closingBalance: string;
  total: number;
  totalPages: number;
  snapshotAt: string;
}

const HISTORY_PAGE_SIZE = 100;

@Injectable()
export class BankingGrpcClient {
  private readonly logger = new Logger(BankingGrpcClient.name);
  private client: ClientGrpc | undefined;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const configuredProtoPath = this.configService.get<string>('BANKING_PROTO_PATH');
    if (!configuredProtoPath) {
      throw new Error('BANKING_PROTO_PATH must point to the Banking Service banking.proto file.');
    }

    const protoPath = resolve(process.cwd(), configuredProtoPath);
    if (!existsSync(protoPath)) {
      throw new Error(`Banking Service proto file was not found at "${protoPath}".`);
    }

    this.client = ClientProxyFactory.create({
      transport: Transport.GRPC,
      options: {
        url: this.configService.get<string>('BANKING_SERVICE_URL', 'localhost:50052'),
        package: 'banking',
        protoPath,
      },
    });
  }

  async getAccountDetails(accountId: number): Promise<BankingAccount> {
    const account = await this.callBanking(
      'GetAccount',
      this.getBankingService().getAccount({ accountId }),
    );
    return this.normalizeAccount(account);
  }

  async getAccountTransactions(
    accountId: number,
    fromDate: string,
    toDate: string,
  ): Promise<BankingTransactionHistory> {
    const transactions: BankingTransaction[] = [];
    let pageNumber = 1;
    let firstPage: HistoryPage | undefined;

    while (!firstPage || pageNumber <= firstPage.totalPages) {
      const response = await this.callBanking(
        'GetAccountTransactionHistory',
        this.getBankingService().getAccountTransactionHistory({
          accountId,
          fromDate,
          toDate,
          page: pageNumber,
          limit: HISTORY_PAGE_SIZE,
          snapshotAt: firstPage?.snapshotAt ?? '',
        }),
      );
      const result = this.readHistoryPage(response);

      if (!firstPage) {
        firstPage = result;
      } else if (
        result.total !== firstPage.total ||
        result.totalPages !== firstPage.totalPages ||
        result.openingBalance !== firstPage.openingBalance ||
        result.closingBalance !== firstPage.closingBalance ||
        result.snapshotAt !== firstPage.snapshotAt
      ) {
        throw new Error('Banking Service returned inconsistent transaction history pages.');
      }

      transactions.push(...result.transactions.map((transaction) => this.normalizeTransaction(transaction)));
      pageNumber += 1;
    }

    if (!firstPage || transactions.length !== firstPage.total) {
      throw new Error('Banking Service returned an incomplete transaction history.');
    }

    return {
      transactions,
      openingBalance: firstPage.openingBalance,
      closingBalance: firstPage.closingBalance,
      total: firstPage.total,
      snapshotAt: firstPage.snapshotAt,
    };
  }

  private getBankingService(): BankingGrpcService {
    if (!this.client) {
      throw new Error('Banking gRPC client has not been initialized.');
    }
    return this.client.getService<BankingGrpcService>('BankingService');
  }

  private async callBanking(method: string, operation: Observable<unknown>): Promise<unknown> {
    try {
      return await lastValueFrom(operation);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Banking Service call '${method}' failed`, error instanceof Error ? error.stack : message);
      const code =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof error.code === 'number'
          ? error.code
          : status.UNAVAILABLE;
      throw new RpcException({
        code,
        message: code === status.UNAVAILABLE ? 'Banking Service is unavailable.' : message,
      });
    }
  }

  private readHistoryPage(response: unknown): HistoryPage {
    if (!response || typeof response !== 'object') {
      throw new Error('Banking Service returned an invalid transaction history response.');
    }
    const source = response as Record<string, unknown>;
    const transactions = source.transactions ?? [];
    if (
      !Array.isArray(transactions) ||
      typeof source.openingBalance !== 'string' ||
      typeof source.closingBalance !== 'string' ||
      !Number.isInteger(source.total) ||
      !Number.isInteger(source.totalPages) ||
      typeof source.snapshotAt !== 'string'
    ) {
      throw new Error('Banking Service returned an incomplete transaction history response.');
    }

    return {
      transactions,
      openingBalance: source.openingBalance,
      closingBalance: source.closingBalance,
      total: source.total as number,
      totalPages: source.totalPages as number,
      snapshotAt: source.snapshotAt,
    };
  }

  private normalizeAccount(account: unknown): BankingAccount {
    if (!account || typeof account !== 'object') {
      throw new Error('Banking Service returned invalid account details.');
    }
    const source = account as Record<string, unknown>;
    if (!Number.isInteger(source.id) || typeof source.balance !== 'string') {
      throw new Error('Banking Service returned incomplete account details.');
    }

    return {
      id: source.id as number,
      accountId: source.id as number,
      accountNumber: this.asString(source.accountNumber),
      balance: source.balance,
      currentBalance: source.balance,
      openingBalance: source.balance,
      closingBalance: source.balance,
      currency: 'USD',
      status: this.asString(source.status),
    };
  }

  private normalizeTransaction(transaction: unknown): BankingTransaction {
    if (!transaction || typeof transaction !== 'object') {
      throw new Error('Banking Service returned an invalid transaction.');
    }
    const source = transaction as Record<string, unknown>;
    const transactionType = source.transactionType;
    const isAccountOpening = source.isAccountOpening === true;
    if (
      (!isAccountOpening &&
        (!Number.isInteger(source.transferId) ||
          Number(source.transferId) < 1)) ||
      (isAccountOpening &&
        source.transferId !== undefined &&
        source.transferId !== null &&
        source.transferId !== 0) ||
      typeof source.referenceNumber !== 'string' ||
      typeof source.transactionDate !== 'string' ||
      (transactionType !== 'CREDIT' && transactionType !== 'DEBIT') ||
      typeof source.amount !== 'string' ||
      typeof source.description !== 'string'
    ) {
      throw new Error('Banking Service returned an incomplete transaction.');
    }

    return {
      ...(isAccountOpening
        ? {}
        : {
            id: source.transferId as number,
            transferId: source.transferId as number,
          }),
      transactionDate: source.transactionDate,
      transactionType,
      type: transactionType,
      amount: source.amount,
      description: source.description,
      direction: transactionType,
      isAccountOpening,
    };
  }

  private asString(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }
}
