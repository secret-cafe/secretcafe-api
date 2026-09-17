// jwt-auth.guard.spec.ts
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from 'src/modules/auth/auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

interface GuardTestRequest {
  cookies: Record<string, string | undefined>;
  user?: {
    sub?: number;
    userId?: number;
    currentUserId?: string;
    email?: string;
    role?: string;
  };
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let jwtService: JwtService;
  let authService: { refreshTokens: jest.Mock };
  let request: GuardTestRequest;
  let response: { cookie: jest.Mock; clearCookie: jest.Mock };

  const payload = (type: 'access' | 'refresh') => ({
    sub: 1,
    userId: 'uu-0001',
    email: 'admin@example.com',
    role: 'Admin',
    type,
  });

  const signAccess = (expiresIn = '1h') =>
    jwtService.sign(payload('access'), { expiresIn });
  const signRefresh = (expiresIn = '1h') =>
    jwtService.sign(payload('refresh'), { expiresIn });

  const buildContext = () => ({
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  });

  beforeEach(() => {
    jwtService = new JwtService({ secret: 'test-secret' });
    authService = { refreshTokens: jest.fn() };
    guard = new JwtAuthGuard(jwtService, authService as unknown as AuthService);
    request = { cookies: {} };
    response = { cookie: jest.fn(), clearCookie: jest.fn() };
  });

  it('passes a valid access token and attaches the same user shape as before', async () => {
    request.cookies = { token: signAccess() };

    expect(await guard.canActivate(buildContext())).toBe(true);
    expect(request.user.sub).toBe(1);
    expect(request.user.userId).toBe(1);
    expect(request.user.currentUserId).toBe('uu-0001');
    expect(request.user.role).toBe('Admin');
    expect(authService.refreshTokens).not.toHaveBeenCalled();
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it('silently refreshes an expired access token and continues the request', async () => {
    request.cookies = {
      token: signAccess('-10s'),
      refresh_token: signRefresh(),
    };
    authService.refreshTokens.mockResolvedValue({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      userPayload: {
        sub: 1,
        userId: 'uu-0001',
        email: 'admin@example.com',
        role: 'Admin',
      },
    });

    expect(await guard.canActivate(buildContext())).toBe(true);

    expect(authService.refreshTokens).toHaveBeenCalledWith(
      expect.any(String),
      1,
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
    expect(request.user.currentUserId).toBe('uu-0001');
    expect(request.user.role).toBe('Admin');
  });

  it('refreshes when the access token is missing but a refresh token exists', async () => {
    request.cookies = { refresh_token: signRefresh() };
    authService.refreshTokens.mockResolvedValue({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      userPayload: {
        sub: 1,
        userId: 'uu-0001',
        email: 'admin@example.com',
        role: 'Admin',
      },
    });

    expect(await guard.canActivate(buildContext())).toBe(true);
    expect(response.cookie).toHaveBeenCalledTimes(2);
    expect(authService.refreshTokens).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
    );
  });

  it('throws UnauthorizedException when the access token is invalid and refresh fails', async () => {
    request.cookies = { token: 'garbage', refresh_token: signRefresh() };
    authService.refreshTokens.mockRejectedValue(
      new UnauthorizedException('Invalid refresh token'),
    );

    await expect(guard.canActivate(buildContext())).rejects.toThrow(
      UnauthorizedException,
    );
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when no cookies are present', async () => {
    request.cookies = {};

    await expect(guard.canActivate(buildContext())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a refresh token passed in the access-token cookie', async () => {
    request.cookies = { token: signRefresh() };

    await expect(guard.canActivate(buildContext())).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
