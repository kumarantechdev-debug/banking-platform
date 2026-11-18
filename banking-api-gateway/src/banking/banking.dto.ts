import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Matches, Max, Min } from 'class-validator';

export class CreateAccountDto {
  @ApiProperty({ minimum: 1, maximum: 2_147_483_647 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  customerId!: number;

  @ApiProperty({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    example: '100.00',
  })
  @Transform(({ value }) =>
    typeof value === 'number' ? String(value) : value,
  )
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/)
  initialBalance!: string;
}

export class CreateTransferDto {
  @ApiProperty({ minimum: 1, maximum: 2_147_483_647 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  fromAccountId!: number;

  @ApiProperty({ minimum: 1, maximum: 2_147_483_647 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  toAccountId!: number;

  @ApiProperty({ example: '25.00' })
  @IsString()
  @Matches(/^(?!0+(?:\.0{1,2})?$)(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/)
  amount!: string;

  @ApiProperty({ minLength: 8, maxLength: 100 })
  @IsString()
  @Matches(/^[A-Za-z0-9._:-]{8,100}$/)
  idempotencyKey!: string;
}
