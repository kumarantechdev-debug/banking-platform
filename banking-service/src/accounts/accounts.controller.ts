import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { Account } from './account.entity';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { GetAccountDto } from './dto/get-account.dto';

@Controller()
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @GrpcMethod('BankingService', 'CreateAccount')
  async createAccount(request: CreateAccountDto) {
    return this.toResponse(await this.accounts.createAccount(request));
  }

  @GrpcMethod('BankingService', 'GetAccount')
  async getAccount(request: GetAccountDto) {
    return this.toResponse(await this.accounts.getAccount(request));
  }

  private toResponse(account: Account) {
    return {
      id: account.id,
      accountNumber: account.accountNumber,
      customerId: account.customerId,
      balance: account.balance,
      status: account.status,
      createdAt: account.createdAt.toISOString(),
    };
  }
}
