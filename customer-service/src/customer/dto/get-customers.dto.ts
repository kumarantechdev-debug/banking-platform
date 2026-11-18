import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class GetCustomersDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 10;

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  @MaxLength(15)
  mobile?: string;

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(
    /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/,
  )
  fromDate?: string;

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(
    /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/,
  )
  toDate?: string;

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsIn(['createdAt', 'name', 'mobile', 'city', 'state', 'status'])
  sortBy?: 'createdAt' | 'name' | 'mobile' | 'city' | 'state' | 'status';

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}
