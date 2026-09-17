// auth.controller.spec.ts
import { UnauthorizedException } from '@nestjs/common';
import express from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    login: jest.Mock;
    refreshTokens: jest.Mock;
    logout: jest.Mock;
  };
  let response: { cookie: jest.Mock; clearCookie: jest.Mock };

  beforeEach(() => {
    authService = {
      login: jest.fn(),
      refreshTokens: jest.fn(),
      logout: jest.fn(),
    };
    response = { cookie: jest.fn(), clearCookie: jest.fn() };
    controller = new AuthController(authService as unknown as AuthService);
  });

  describe('login', () => {
    it('sets access + refresh cookies without exposing tokens in the body', async () => {
      authService.login.mockResolvedValue({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
      });

      const result = await controller.login(
        { email: 'admin@example.com', password: 'password123' },
        response as unknown as express.Response,
      );

      expect(authService.login).toHaveBeenCalledWith(
        'admin@example.com',
        'password123',
      );
      expect(response.cookie).toHaveBeenCalledTimes(2);
      expect(response.cookie).toHaveBeenCalledWith(
        'token',
        'access-token',
        expect.anything(),
      );
      expect(response.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'refresh-token',
        expect.anything(),
      );
      expect(result).toEqual({ status: true, message: 'Login Successful' });
    });
  });

  describe('refresh', () => {
    it('rotates tokens and sets both cookies', async () => {
      authService.refreshTokens.mockResolvedValue({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        userPayload: { sub: 1 },
      });
      const req = { cookies: { refresh_token: 'old-refresh-token' } };

      const result = await controller.refresh(
        req as unknown as express.Request,
        response as unknown as express.Response,
      );

      expect(authService.refreshTokens).toHaveBeenCalledWith(
        'old-refresh-token',
      );
      expect(response.cookie).toHaveBeenCalledWith(
        'token',
        'new-access',
        expect.anything(),
      );
      expect(response.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'new-refresh',
        expect.anything(),
      );
      expect(result).toEqual({ status: true, message: 'Session refreshed' });
    });

    it('throws UnauthorizedException when the refresh-token cookie is missing', async () => {
      const req = { cookies: {} };

      await expect(
        controller.refresh(
          req as unknown as express.Request,
          response as unknown as express.Response,
        ),
      ).rejects.toThrow(UnauthorizedException);
      expect(response.cookie).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revokes the refresh token and clears both cookies', async () => {
      const req = { cookies: { refresh_token: 'refresh-token' } };

      const result = await controller.logout(
        req as unknown as express.Request,
        response as unknown as express.Response,
      );

      expect(authService.logout).toHaveBeenCalledWith('refresh-token');
      expect(response.clearCookie).toHaveBeenCalledWith(
        'token',
        expect.anything(),
      );
      expect(response.clearCookie).toHaveBeenCalledWith(
        'refresh_token',
        expect.anything(),
      );
      expect(result).toEqual({
        status: true,
        message: 'Logged out successfully',
      });
    });
  });
});
