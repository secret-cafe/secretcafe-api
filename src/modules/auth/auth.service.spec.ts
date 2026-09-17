// auth.service.spec.ts
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthService } from './auth.service';

interface UpdateCall {
  where: { id: number };
  data: {
    refreshTokenHash: string | null;
    refreshTokenExpiresAt: Date | null;
  };
}

interface UpdateManyCall {
  where: { id: number; refreshTokenHash: string };
  data: { refreshTokenHash: null; refreshTokenExpiresAt: null };
}

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;
  let prisma: {
    userInfo: {
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  const hashedPassword = bcrypt.hashSync('password123', 10);

  const baseUser = {
    id: 1,
    userId: 'uu-0001',
    email: 'admin@example.com',
    password: hashedPassword,
    isActive: true,
    role: { name: 'Admin' },
  };

  const sha256 = (value: string) =>
    createHash('sha256').update(value).digest('hex');

  const tokenPayload = (
    type: 'access' | 'refresh',
    sub = 1,
    userId = 'uu-0001',
  ) => ({
    sub,
    userId,
    email: 'admin@example.com',
    role: 'Admin',
    type,
    jti: randomUUID(),
  });

  beforeEach(() => {
    prisma = {
      userInfo: {
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    jwtService = new JwtService({ secret: 'test-secret' });
    service = new AuthService(prisma as unknown as PrismaService, jwtService);
  });

  describe('login', () => {
    it('issues an access token and a refresh token', async () => {
      prisma.userInfo.findFirst.mockResolvedValue({ ...baseUser });

      const result = await service.login('admin@example.com', 'password123');

      expect(result.access_token).toBeTruthy();
      expect(result.refresh_token).toBeTruthy();

      const accessPayload = jwtService.decode<{ type?: string }>(
        result.access_token,
      );
      const refreshPayload = jwtService.decode<{ type?: string }>(
        result.refresh_token,
      );
      expect(accessPayload.type).toBe('access');
      expect(refreshPayload.type).toBe('refresh');
    });

    it('stores only the refresh-token hash and expiry on the user', async () => {
      prisma.userInfo.findFirst.mockResolvedValue({ ...baseUser });

      const result = await service.login('admin@example.com', 'password123');

      const updateCall = (
        prisma.userInfo.update.mock.calls as UpdateCall[][]
      )[0][0];
      expect(updateCall.where).toEqual({ id: 1 });
      expect(updateCall.data.refreshTokenHash).toBe(
        sha256(result.refresh_token),
      );
      expect(updateCall.data.refreshTokenExpiresAt).not.toBeNull();
      expect(updateCall.data.refreshTokenHash).not.toBe(result.refresh_token);
    });

    it('throws UnauthorizedException when the password is wrong', async () => {
      prisma.userInfo.findFirst.mockResolvedValue({ ...baseUser });

      await expect(
        service.login('admin@example.com', 'wrong-password'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshTokens', () => {
    const refreshUser = (
      refreshToken: string,
      expiresAt = new Date(Date.now() + 60 * 60 * 1000),
    ) => ({
      ...baseUser,
      refreshTokenHash: sha256(refreshToken),
      refreshTokenExpiresAt: expiresAt,
    });

    it('rotates the refresh token and persists the new hash', async () => {
      const oldToken = jwtService.sign(tokenPayload('refresh'), {
        expiresIn: '1h',
      });
      prisma.userInfo.findFirst.mockResolvedValue(refreshUser(oldToken));

      const result = await service.refreshTokens(oldToken);

      expect(result.refresh_token).not.toBe(oldToken);
      expect(result.access_token).toBeTruthy();
      expect(result.userPayload.sub).toBe(1);
      expect(result.userPayload.role).toBe('Admin');

      const updateCall = (
        prisma.userInfo.update.mock.calls as UpdateCall[][]
      )[0][0];
      expect(updateCall.data.refreshTokenHash).toBe(
        sha256(result.refresh_token),
      );
    });

    it('rejects a previously rotated (replayed) refresh token', async () => {
      const replayedToken = jwtService.sign(tokenPayload('refresh'), {
        expiresIn: '1h',
      });
      const currentToken = jwtService.sign(tokenPayload('refresh'), {
        expiresIn: '1h',
      });
      // DB now stores the CURRENT token; the attacker replays the OLD one.
      prisma.userInfo.findFirst.mockResolvedValue(refreshUser(currentToken));

      await expect(service.refreshTokens(replayedToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects an expired refresh token', async () => {
      const expiredToken = jwtService.sign(tokenPayload('refresh'), {
        expiresIn: '-10s',
      });
      prisma.userInfo.findFirst.mockResolvedValue(refreshUser(expiredToken));

      await expect(service.refreshTokens(expiredToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a refresh token whose stored expiry has passed', async () => {
      const token = jwtService.sign(tokenPayload('refresh'), {
        expiresIn: '1h',
      });
      prisma.userInfo.findFirst.mockResolvedValue(
        refreshUser(token, new Date(Date.now() - 1000)),
      );

      await expect(service.refreshTokens(token)).rejects.toThrow(
        UnauthorizedException,
      );
    });
    // PART1_END

    it('rejects an access token passed as a refresh token', async () => {
      const accessToken = jwtService.sign(tokenPayload('access'), {
        expiresIn: '1h',
      });

      await expect(service.refreshTokens(accessToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a refresh token for a different user than the access token', async () => {
      const token = jwtService.sign(tokenPayload('refresh', 2), {
        expiresIn: '1h',
      });
      prisma.userInfo.findFirst.mockResolvedValue(refreshUser(token));

      await expect(service.refreshTokens(token, 1)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects refresh for an inactive user', async () => {
      const token = jwtService.sign(tokenPayload('refresh'), {
        expiresIn: '1h',
      });
      prisma.userInfo.findFirst.mockResolvedValue({
        ...refreshUser(token),
        isActive: false,
      });

      await expect(service.refreshTokens(token)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('revokes the stored refresh token for the matching user', async () => {
      const token = jwtService.sign(tokenPayload('refresh'), {
        expiresIn: '1h',
      });
      prisma.userInfo.updateMany.mockResolvedValue({ count: 1 });

      await service.logout(token);

      const call = (
        prisma.userInfo.updateMany.mock.calls as UpdateManyCall[][]
      )[0][0];
      expect(call.where.id).toBe(1);
      expect(call.where.refreshTokenHash).toBe(sha256(token));
      expect(call.data.refreshTokenHash).toBeNull();
      expect(call.data.refreshTokenExpiresAt).toBeNull();
    });

    it('does not touch the DB when the refresh token is invalid', async () => {
      await service.logout('not-a-real-token');

      expect(prisma.userInfo.updateMany).not.toHaveBeenCalled();
    });

    it('does nothing when no refresh token is provided', async () => {
      await service.logout();

      expect(prisma.userInfo.updateMany).not.toHaveBeenCalled();
    });
  });
});
