import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsInt,
  Matches,
  Max,
  Min,
  IsOptional,
} from 'class-validator';

export class GenerateStatementDto {
  @ApiProperty({ minimum: 1, maximum: 2_147_483_647 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  accountId!: number;

  @ApiProperty({ format: 'date', example: '2026-01-01' })
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fromDate!: string;

  @ApiProperty({ format: 'date', example: '2026-01-31' })
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  toDate!: string;
}

export class StatementTransactionsQueryDto {
  @ApiPropertyOptional({ enum: ['CREDIT', 'DEBIT'] })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsIn(['CREDIT', 'DEBIT'])
  transactionType?: 'CREDIT' | 'DEBIT';

  @ApiPropertyOptional({ format: 'date', example: '2026-01-01' })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fromDate?: string;

  @ApiPropertyOptional({ format: 'date', example: '2026-01-31' })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  toDate?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 2_147_483_647,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
