import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import type { Response } from 'express';
import { AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS } from './auth-cookie.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

describe('AuthController', () => {
  const login = jest.fn();
  let controller: AuthController;
  let response: Pick<Response, 'cookie' | 'clearCookie'>;

  beforeEach(async () => {
    jest.clearAllMocks();
    login.mockResolvedValue({
      accessToken: 'signed-token',
    });
    response = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    };

    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: { login } }],
    }).compile();

    controller = module.get(AuthController);
  });

  it('stores the login JWT in the HttpOnly authentication cookie', async () => {
    await expect(
      controller.login(
        { mobile: '+14155552671', password: 'Test@12345' },
        response as Response,
      ),
    ).resolves.toEqual({
      message: 'Login successful',
    });

    expect(response.cookie).toHaveBeenCalledWith(
      AUTH_COOKIE_NAME,
      'signed-token',
      AUTH_COOKIE_OPTIONS,
    );
    expect(AUTH_COOKIE_OPTIONS.httpOnly).toBe(true);
  });

  it('clears the authentication cookie on logout', () => {
    expect(controller.logout(response as Response)).toEqual({
      message: 'Logout successful',
    });
    expect(response.clearCookie).toHaveBeenCalledWith(
      AUTH_COOKIE_NAME,
      AUTH_COOKIE_OPTIONS,
    );
  });
});
