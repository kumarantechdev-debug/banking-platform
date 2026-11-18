import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, Matches } from 'class-validator';

export class CreateSettlementDto {
  @ApiProperty({ format: 'date', example: '2026-01-31' })
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  jobDate!: string;
}

export class SettlementReportJobDto {
  @ApiProperty()
  id!: number;

  @ApiProperty({ example: '2026-01-31' })
  jobDate!: string;

  @ApiProperty({ example: 'COMPLETED' })
  status!: string;

  @ApiProperty()
  totalTransactions!: number;

  @ApiProperty()
  successfulTransactions!: number;

  @ApiProperty()
  failedTransactions!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  startedAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  completedAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

export class SettlementReportTransactionDto {
  @ApiProperty()
  id!: number;

  @ApiProperty({ description: 'ID of the failed transfer' })
  transferId!: number;

  @ApiProperty({ example: '125.00' })
  amount!: string;

  @ApiProperty({ example: 'FAILED' })
  status!: string;

  @ApiProperty({ description: 'Number of processing attempts' })
  retryCount!: number;

  @ApiProperty({ description: 'Failure reason' })
  errorMessage!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  nextRetryAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  processedAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

export class SettlementReportDto {
  @ApiProperty({ type: SettlementReportJobDto })
  job!: SettlementReportJobDto;

  @ApiProperty({ type: [SettlementReportTransactionDto] })
  failureTransactions!: SettlementReportTransactionDto[];
}
