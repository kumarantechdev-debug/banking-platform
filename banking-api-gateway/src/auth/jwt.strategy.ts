import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AUTH_COOKIE_NAME } from './auth-cookie.js';

export interface JwtPayload {
  sub: number;
  customerId: number;
  mobile: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedCustomer {
  customerId: number;
  mobile: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => extractTokenFromCookie(request),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  validate(payload: JwtPayload): AuthenticatedCustomer {
    if (
      !Number.isSafeInteger(payload.customerId) ||
      payload.customerId <= 0 ||
      typeof payload.mobile !== 'string' ||
      !payload.mobile
    ) {
      throw new UnauthorizedException('Invalid token');
    }

    return {
      customerId: payload.customerId,
      mobile: payload.mobile,
    };
  }
}

function extractTokenFromCookie(request: Request): string | null {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) {
    return null;
  }

  const prefix = `${AUTH_COOKIE_NAME}=`;
  for (const cookie of cookieHeader.split(';')) {
    const trimmedCookie = cookie.trim();
    if (trimmedCookie.startsWith(prefix)) {
      try {
        return decodeURIComponent(trimmedCookie.slice(prefix.length));
      } catch {
        return null;
      }
    }
  }

  return null;
}
