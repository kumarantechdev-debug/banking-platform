import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCustomerDto {
  @ApiProperty({ maxLength: 150 })
  @IsString()
  @Matches(/\S/)
  @MaxLength(150)
  name!: string;

  @ApiProperty({ maxLength: 15, example: '+14155552671' })
  @IsString()
  @Matches(/^\+?[1-9]\d{6,14}$/)
  @MaxLength(15)
  mobile!: string;

  @ApiProperty({ maxLength: 100 })
  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  city!: string;

  @ApiProperty({ maxLength: 100 })
  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  state!: string;

  @ApiProperty({ maxLength: 72, writeOnly: true })
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password!: string;
}

export class ListCustomersDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 10;

  @ApiPropertyOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  @MaxLength(15)
  mobile?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'] })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @ApiPropertyOptional({ format: 'date-time' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}(?:T.*)?$/)
  fromDate?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}(?:T.*)?$/)
  toDate?: string;

  @ApiPropertyOptional({ enum: ['createdAt', 'name', 'mobile', 'city'] })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsIn(['createdAt', 'name', 'mobile', 'city'])
  sortBy?: 'createdAt' | 'name' | 'mobile' | 'city';

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'] })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}
