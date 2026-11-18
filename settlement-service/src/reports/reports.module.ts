import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettlementTransaction } from '../settlement-transaction/entities/settlement-transaction.entity';
import { FailureReportService } from './failure-report.service';

@Module({
  imports: [TypeOrmModule.forFeature([SettlementTransaction])],
  providers: [FailureReportService],
  exports: [FailureReportService],
})
export class ReportsModule {}
