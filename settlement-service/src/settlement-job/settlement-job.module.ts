import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettlementJob } from './entities/settlement-job.entity';
import { SettlementJobService } from './settlement-job.service';
import { SettlementAuditLogModule } from '../settlement-audit-log/settlement-audit-log.module';

@Module({
  imports: [TypeOrmModule.forFeature([SettlementJob]), SettlementAuditLogModule],
  providers: [SettlementJobService],
  exports: [SettlementJobService],
})
export class SettlementJobModule {}
