import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettlementTransaction } from './entities/settlement-transaction.entity';
import { SettlementTransactionService } from './settlement-transaction.service';

@Module({
  imports: [TypeOrmModule.forFeature([SettlementTransaction])],
  providers: [SettlementTransactionService],
  exports: [SettlementTransactionService],
})
export class SettlementTransactionModule {}
