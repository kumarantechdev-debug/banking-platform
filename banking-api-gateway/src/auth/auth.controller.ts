import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../common/public.decorator.js';
import { AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS } from './auth-cookie.js';
import { AuthService } from './auth.service.js';
import { LoginDto, type LoginResponse } from './auth.dto.js';

class LoginResponseDto implements LoginResponse {
  @ApiProperty({ example: 'Login successful' })
  message!: 'Login successful';
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Authenticate a customer' })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid login request' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const result = await this.auth.login(dto);
    response.cookie(AUTH_COOKIE_NAME, result.accessToken, AUTH_COOKIE_OPTIONS);
    return { message: 'Login successful' };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(AUTH_COOKIE_NAME)
  @ApiOperation({ summary: 'Log out the authenticated customer' })
  @ApiOkResponse({ description: 'Logout successful' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid authentication' })
  logout(@Res({ passthrough: true }) response: Response): { message: string } {
    response.clearCookie(AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS);
    return { message: 'Logout successful' };
  }
}
