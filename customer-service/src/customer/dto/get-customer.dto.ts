import { IsInt, Min } from 'class-validator';

export class GetCustomerDto {
  @IsInt()
  @Min(1)
  id = 0;
}
