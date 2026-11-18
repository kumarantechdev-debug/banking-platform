import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettlementAuditLog } from './entities/settlement-audit-log.entity';
import { SettlementAuditLogService } from './settlement-audit-log.service';

@Module({
  imports: [TypeOrmModule.forFeature([SettlementAuditLog])],
  providers: [SettlementAuditLogService],
  exports: [SettlementAuditLogService],
})
export class SettlementAuditLogModule {}
