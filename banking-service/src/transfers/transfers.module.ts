import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransferAudit } from './transfer-audit.entity';
import { TransfersController } from './transfers.controller';
import { TransfersService } from './transfers.service';
import { Transfer } from './transfer.entity';
import { AccountBalanceLedgerEntry } from '../ledger/account-balance-ledger-entry.entity';
import { AccountTransactionHistoryService } from './account-transaction-history.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transfer, TransferAudit, AccountBalanceLedgerEntry]),
  ],
  controllers: [TransfersController],
  providers: [TransfersService, AccountTransactionHistoryService],
})
export class TransfersModule {}
