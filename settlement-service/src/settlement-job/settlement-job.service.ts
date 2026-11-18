import { status } from '@grpc/grpc-js';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RpcException } from '@nestjs/microservices';
import { Repository } from 'typeorm';
import {
  SettlementAuditAction,
  SettlementAuditLogService,
} from '../settlement-audit-log/settlement-audit-log.service';
import { SettlementJob } from './entities/settlement-job.entity';

@Injectable()
export class SettlementJobService {
  private readonly logger = new Logger(SettlementJobService.name);

  constructor(
    @InjectRepository(SettlementJob)
    private readonly repository: Repository<SettlementJob>,
    private readonly auditLogService: SettlementAuditLogService,
  ) {}

  normalizeJobDate(jobDate: Date | string): Date {
    const dateOnly = typeof jobDate === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(jobDate) : null;
    const value = dateOnly
      ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
      : new Date(jobDate);
    if (Number.isNaN(value.getTime())) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'A valid jobDate is required.',
      });
    }
    if (
      dateOnly &&
      (value.getFullYear() !== Number(dateOnly[1]) ||
        value.getMonth() !== Number(dateOnly[2]) - 1 ||
        value.getDate() !== Number(dateOnly[3]))
    ) {
      throw new RpcException({ code: status.INVALID_ARGUMENT, message: 'A valid jobDate is required.' });
    }

    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  async createJob(jobDate: Date | string): Promise<SettlementJob> {
    const date = this.normalizeJobDate(jobDate);
    const existing = await this.repository.findOne({ where: { jobDate: date } });

    if (existing) {
      this.logger.warn(`Settlement job already exists for ${date.toISOString()}`);
      throw new RpcException({
        code: status.ALREADY_EXISTS,
        message: `Settlement job already exists for ${date.toISOString()}`,
      });
    }

    const job = this.repository.create({
      jobDate: date,
      status: 'PENDING',
      totalTransactions: 0,
      successfulTransactions: 0,
      failedTransactions: 0,
    });

    const createdJob = await this.repository.save(job);
    await this.auditLogService.record({
      jobId: createdJob.id,
      action: SettlementAuditAction.JOB_CREATED,
      status: createdJob.status,
      description: `Settlement job created for ${String(createdJob.jobDate)}.`,
    });
    return createdJob;
  }

  async startJob(jobDate: Date | string): Promise<SettlementJob> {
    const job = await this.createJob(jobDate);
    job.startedAt = new Date();
    return this.repository.save(job);
  }

  async findById(id: number): Promise<SettlementJob | null> {
    return this.repository.findOne({ where: { id } });
  }

  async findByDate(jobDate: Date | string): Promise<SettlementJob | null> {
    return this.repository.findOne({ where: { jobDate: this.normalizeJobDate(jobDate) } });
  }

  async updateSummary(id: number, updates: Partial<SettlementJob>): Promise<SettlementJob | null> {
    const job = await this.repository.findOne({ where: { id } });
    if (!job) {
      return null;
    }

    Object.assign(job, updates);
    return this.repository.save(job);
  }
}
