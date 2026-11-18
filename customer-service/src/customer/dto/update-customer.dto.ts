import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateCustomerDto {
  @IsInt()
  @Min(1)
  id = 0;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'name must contain non-whitespace characters' })
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[1-9]\d{6,14}$/, {
    message: 'mobile must be a valid international phone number',
  })
  @MaxLength(15)
  mobile?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'city must contain non-whitespace characters' })
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'state must contain non-whitespace characters' })
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}
