import { IsInt, IsString, Matches, Max, Min } from 'class-validator';

export class GetAccountTransactionHistoryDto {
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  accountId!: number;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fromDate!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  toDate!: string;

  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  page = 0;

  @IsInt()
  @Min(0)
  @Max(100)
  limit = 0;

  @IsString()
  snapshotAt = '';
}
