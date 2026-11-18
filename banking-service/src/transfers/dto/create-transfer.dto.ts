import { IsInt, IsString, Matches, Max, Min } from 'class-validator';

export class CreateTransferDto {
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  fromAccountId!: number;

  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  toAccountId!: number;

  @IsString()
  @Matches(/^(?!0+(?:\.0{1,2})?$)(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/)
  amount!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9._:-]{8,100}$/)
  idempotencyKey!: string;
}
