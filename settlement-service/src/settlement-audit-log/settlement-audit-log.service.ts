import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SettlementAuditLog } from './entities/settlement-audit-log.entity';

export const SettlementAuditAction = {
  JOB_CREATED: 'JOB_CREATED',
  PROCESSING_STARTED: 'PROCESSING_STARTED',
  TRANSACTION_PROCESSING_STARTED: 'TRANSACTION_PROCESSING_STARTED',
  TRANSACTION_SETTLED: 'TRANSACTION_SETTLED',
  TRANSACTION_ATTEMPT_FAILED: 'TRANSACTION_ATTEMPT_FAILED',
  RETRY_ATTEMPTED: 'RETRY_ATTEMPTED',
  TRANSACTION_PERMANENTLY_FAILED: 'TRANSACTION_PERMANENTLY_FAILED',
  JOB_COMPLETED: 'JOB_COMPLETED',
} as const;

export interface SettlementAuditEvent {
  jobId: number;
  transferId?: number | null;
  action: (typeof SettlementAuditAction)[keyof typeof SettlementAuditAction];
  status: string;
  description: string;
  errorMessage?: string | null;
  errorDetails?: string | null;
}

@Injectable()
export class SettlementAuditLogService {
  private readonly logger = new Logger(SettlementAuditLogService.name);

  constructor(
    @InjectRepository(SettlementAuditLog)
    private readonly repository: Repository<SettlementAuditLog>,
  ) {}

  async record(event: SettlementAuditEvent): Promise<void> {
    try {
      await this.repository.insert({
        jobId: event.jobId,
        transferId: event.transferId ?? null,
        action: event.action,
        status: event.status,
        description: event.description,
        errorMessage: event.errorMessage ?? null,
        errorDetails: event.errorDetails ?? null,
      });
    } catch (error) {
      const details = error instanceof Error ? error.stack ?? error.message : String(error);
      this.logger.error(`Could not persist settlement audit event ${event.action}`, details);
    }
  }
}
