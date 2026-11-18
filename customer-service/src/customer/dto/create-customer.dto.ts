import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'name must contain non-whitespace characters' })
  @MaxLength(150)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[1-9]\d{6,14}$/, {
    message: 'mobile must be a valid international phone number',
  })
  @MaxLength(15)
  mobile!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'city must contain non-whitespace characters' })
  @MaxLength(100)
  city!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'state must contain non-whitespace characters' })
  @MaxLength(100)
  state!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password!: string;
}
