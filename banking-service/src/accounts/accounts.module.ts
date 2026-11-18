import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomersModule } from '../customers/customers.module';
import { Account } from './account.entity';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { AccountBalanceLedgerEntry } from '../ledger/account-balance-ledger-entry.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Account, AccountBalanceLedgerEntry]),
    CustomersModule,
  ],
  controllers: [AccountsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
