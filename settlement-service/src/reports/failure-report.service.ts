import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SettlementTransaction } from '../settlement-transaction/entities/settlement-transaction.entity';

@Injectable()
export class FailureReportService {
  private readonly logger = new Logger(FailureReportService.name);

  constructor(
    @InjectRepository(SettlementTransaction)
    private readonly repository: Repository<SettlementTransaction>,
  ) {}

  async generateReport(jobId: number): Promise<SettlementTransaction[]> {
    return this.repository.find({
      where: { jobId, status: 'FAILED' },
      order: { processedAt: 'DESC' },
    });
  }
}
