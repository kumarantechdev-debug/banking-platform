import { IsInt, Min } from 'class-validator';

export class DeleteCustomerDto {
  @IsInt()
  @Min(1)
  id = 0;
}
