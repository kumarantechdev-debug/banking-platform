import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { DataSource, Repository } from 'typeorm';
import {
  grpcError,
  isDuplicateEntry,
  mapDatabaseError,
} from '../common/grpc-errors';
import { isValidMoney, normalizeMoney } from '../common/money';
import { CustomerClientService } from '../customers/customer-client.service';
import { AccountBalanceLedgerEntry } from '../ledger/account-balance-ledger-entry.entity';
import { Account, AccountStatus } from './account.entity';

export interface CreateAccountInput {
  customerId: number;
  initialBalance: string;
}

export interface GetAccountInput {
  accountId: number;
}

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account)
    private readonly accounts: Repository<Account>,
    private readonly customers: CustomerClientService,
    private readonly dataSource: DataSource,
  ) {}

  async createAccount(input: CreateAccountInput): Promise<Account> {
    if (
      !Number.isInteger(input.customerId) ||
      input.customerId < 1 ||
      input.customerId > 2_147_483_647 ||
      !isValidMoney(input.initialBalance)
    ) {
      throw grpcError(status.INVALID_ARGUMENT, 'Invalid account details.');
    }

    await this.customers.assertCustomerExists(input.customerId);
    const balance = normalizeMoney(input.initialBalance);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const now = new Date();
      const account = this.accounts.create({
        accountNumber: `BA${randomInt(0, 1_000_000_000_000)
          .toString()
          .padStart(15, '0')}`,
        customerId: input.customerId,
        balance,
        status: AccountStatus.ACTIVE,
        createdAt: now,
        updatedAt: now,
      });

      try {
        return await this.dataSource.transaction(async (manager) => {
          const savedAccount = await manager
            .getRepository(Account)
            .save(account);
          await manager.getRepository(AccountBalanceLedgerEntry).save({
            accountId: savedAccount.id,
            transferId: null,
            entryType: 'ACCOUNT_OPENING',
            transactionType: null,
            referenceNumber: null,
            amount: savedAccount.balance,
            balanceAfter: savedAccount.balance,
            effectiveAt: savedAccount.createdAt,
            description: 'Account opening balance',
          });
          return savedAccount;
        });
      } catch (error) {
        if (isDuplicateEntry(error) && attempt < 2) {
          continue;
        }
        throw mapDatabaseError(error);
      }
    }

    throw grpcError(status.INTERNAL, 'An account could not be created.');
  }

  async getAccount(input: GetAccountInput): Promise<Account> {
    if (
      !Number.isInteger(input.accountId) ||
      input.accountId < 1 ||
      input.accountId > 2_147_483_647
    ) {
      throw grpcError(status.INVALID_ARGUMENT, 'Invalid account ID.');
    }

    try {
      const account = await this.accounts.findOneBy({ id: input.accountId });
      if (!account) {
        throw grpcError(status.NOT_FOUND, 'Account not found.');
      }
      return account;
    } catch (error) {
      if (error instanceof RpcException) {
        throw error;
      }
      throw mapDatabaseError(error);
    }
  }
}
