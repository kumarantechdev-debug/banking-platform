import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

export class PositiveIdParamDto {
  @ApiProperty({ minimum: 1, maximum: 2_147_483_647 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  id!: number;
}
