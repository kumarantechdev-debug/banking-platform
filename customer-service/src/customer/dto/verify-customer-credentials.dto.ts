import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class VerifyCustomerCredentialsDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[1-9]\d{6,14}$/, {
    message: 'mobile must be a valid international phone number',
  })
  @MaxLength(15)
  mobile!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password!: string;
}
