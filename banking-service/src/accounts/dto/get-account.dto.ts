import { IsInt, Max, Min } from 'class-validator';

export class GetAccountDto {
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  accountId!: number;
}
