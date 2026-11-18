import { Module } from '@nestjs/common';
import { BankingClientModule } from '../banking-client/banking-client.module';
import { SettlementJobModule } from '../settlement-job/settlement-job.module';
import { SettlementTransactionModule } from '../settlement-transaction/settlement-transaction.module';
import { SettlementScheduler } from './settlement.scheduler';
import { SettlementAuditLogModule } from '../settlement-audit-log/settlement-audit-log.module';

@Module({
  imports: [SettlementJobModule, SettlementTransactionModule, BankingClientModule, SettlementAuditLogModule],
  providers: [SettlementScheduler],
  exports: [SettlementScheduler],
})
export class SchedulerModule {}
