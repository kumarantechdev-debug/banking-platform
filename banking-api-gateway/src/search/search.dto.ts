import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SearchCustomersDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  q!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
