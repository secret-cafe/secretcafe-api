// auth.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { throwUnauthorizedException } from 'src/common/utils/http-exception.helper';
import { JWT_ACCESS_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN } from 'src/common/constants/constants';

interface TokenUser {
  id: number;
  userId: string;
  email: string;
  role?: { name?: string } | null;
  isActive?: boolean;
}

/** Template literal accepted by jsonwebtoken `expiresIn` (e.g. "15m", "7d"). */
type JwtDuration =
  | `${number}`
  | `${number}ms`
  | `${number}s`
  | `${number}m`
  | `${number}h`
  | `${number}d`
  | `${number}w`
  | `${number}y`;

interface RefreshTokenPayload {
  sub: number;
  type: string;
}

@Injectable()
export class AuthService {
  private readonly accessTokenExpiresIn: JwtDuration = (JWT_ACCESS_EXPIRES_IN ?? '15m') as JwtDuration;
  private readonly refreshTokenExpiresIn: JwtDuration = (JWT_REFRESH_EXPIRES_IN ?? '7d') as JwtDuration;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.userInfo.findFirst({
      where: { email, deletedAt: null },
      include: {
        role: true,
      },
    });

    if (!user) throwUnauthorizedException();

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) throwUnauthorizedException();

    return user;
  }

  /**
   * Issues a short-lived access token and a long-lived refresh token.
   * Both are returned to the controller which stores them in HTTP-only
   * cookies; only the refresh-token hash and its expiry are persisted.
   */
  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);

    const tokens = this.issueTokens(user);

    await this.prisma.userInfo.update({
      where: { id: user.id },
      data: {
        refreshTokenHash: this.hashRefreshToken(tokens.refresh_token),
        refreshTokenExpiresAt: this.refreshTokenExpiry(tokens.refresh_token),
      },
    });

    return tokens;
  }

  /**
   * Validates a refresh token (signature, type, stored hash, stored expiry),
   * rotates it into a brand-new access/refresh pair and persists the new hash.
   * A used, revoked or expired refresh token is rejected, so a previously
   * rotated/revoked token can never be replayed.
   */
  async refreshTokens(refreshToken: string, expectedUserId?: number) {
    const payload = await this.verifyRefreshToken(refreshToken);

    if (expectedUserId !== undefined && payload.sub !== expectedUserId) {
      throwUnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.userInfo.findFirst({
      where: { id: payload.sub, deletedAt: null },
      include: { role: true },
    });

    if (!user || user.isActive === false) {
      throwUnauthorizedException();
    }

    if (
      !user.refreshTokenHash ||
      user.refreshTokenHash !== this.hashRefreshToken(refreshToken)
    ) {
      throwUnauthorizedException('Invalid refresh token');
    }

    if (
      !user.refreshTokenExpiresAt ||
      user.refreshTokenExpiresAt.getTime() <= Date.now()
    ) {
      throwUnauthorizedException('Refresh token expired');
    }

    const tokens = this.issueTokens(user);

    await this.prisma.userInfo.update({
      where: { id: user.id },
      data: {
        refreshTokenHash: this.hashRefreshToken(tokens.refresh_token),
        refreshTokenExpiresAt: this.refreshTokenExpiry(tokens.refresh_token),
      },
    });

    return {
      ...tokens,
      userPayload: {
        sub: user.id,
        userId: user.userId,
        email: user.email,
        role: user.role?.name,
      },
    };
  }

  /**
   * Revokes the stored refresh token (when a valid one is supplied) so the
   * session cannot be resumed after logout. Always safe to call.
   */
  async logout(refreshToken?: string) {
    if (!refreshToken) {
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync<{ sub?: number }>(
        refreshToken,
      );
      if (!payload?.sub) {
        return;
      }

      await this.prisma.userInfo.updateMany({
        where: {
          id: payload.sub,
          refreshTokenHash: this.hashRefreshToken(refreshToken),
        },
        data: {
          refreshTokenHash: null,
          refreshTokenExpiresAt: null,
        },
      });
    } catch {
      // Invalid/expired token: nothing to revoke, cookies are still cleared.
    }
  }

  private async verifyRefreshToken(
    refreshToken: string,
  ): Promise<RefreshTokenPayload> {
    let payload: RefreshTokenPayload;
    try {
      payload =
        await this.jwtService.verifyAsync<RefreshTokenPayload>(refreshToken);
    } catch {
      throwUnauthorizedException('Invalid or expired refresh token');
    }

    if (!payload?.sub || payload.type !== 'refresh') {
      throwUnauthorizedException('Invalid refresh token');
    }

    return payload;
  }

  private issueTokens(user: TokenUser) {
    const basePayload = {
      sub: user.id,
      userId: user.userId,
      email: user.email,
      role: user.role?.name,
    };

    const accessToken = this.jwtService.sign(
      { ...basePayload, type: 'access' },
      { expiresIn: this.accessTokenExpiresIn },
    );
    const refreshToken = this.jwtService.sign(
      { ...basePayload, type: 'refresh' },
      { expiresIn: this.refreshTokenExpiresIn },
    );

    return { access_token: accessToken, refresh_token: refreshToken };
  }

  private hashRefreshToken(refreshToken: string): string {
    return createHash('sha256').update(refreshToken).digest('hex');
  }

  private refreshTokenExpiry(refreshToken: string): Date {
    try {
      const decoded = this.jwtService.decode<{ exp?: number }>(refreshToken);
      if (typeof decoded?.exp === 'number') {
        return new Date(decoded.exp * 1000);
      }
    } catch {
      // Fall back to the default refresh duration below.
    }
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }
}
