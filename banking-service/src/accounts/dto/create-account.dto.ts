import { IsInt, IsString, Matches, Max, Min } from 'class-validator';

export class CreateAccountDto {
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  customerId!: number;

  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/)
  initialBalance!: string;
}
