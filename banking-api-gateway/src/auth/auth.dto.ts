import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ maxLength: 15, example: '+14155552671' })
  @IsString()
  @Matches(/^\+?[1-9]\d{6,14}$/)
  @MaxLength(15)
  mobile!: string;

  @ApiProperty({ maxLength: 72, writeOnly: true })
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password!: string;
}

export interface LoginResponse {
  message: 'Login successful';
}

export interface LoginToken {
  accessToken: string;
}
