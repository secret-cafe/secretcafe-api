// jwt-auth.guard.ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Response as ExpressResponse } from 'express';
import { AuthService } from 'src/modules/auth/auth.service';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  accessCookieOptions,
  refreshCookieOptions,
} from 'src/common/constants/constants';
import { throwUnauthorizedException } from 'src/common/utils/http-exception.helper';

interface JwtPayload {
  sub?: number;
  userId?: string;
  email?: string;
  role?: string;
  type?: string;
}

interface GuardRequest {
  cookies?: Record<string, unknown>;
  user?: unknown;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<GuardRequest>();
    const response = context.switchToHttp().getResponse<ExpressResponse>();
    const cookies = request?.cookies;

    if (!cookies) {
      throwUnauthorizedException();
    }

    const accessToken = cookies[ACCESS_TOKEN_COOKIE] as string | undefined;
    const refreshToken = cookies[REFRESH_TOKEN_COOKIE] as string | undefined;

    // 1) Try the short-lived access token as-is.
    if (accessToken) {
      
      try {
        const payload = await this.jwtService.verifyAsync<JwtPayload>(accessToken);
        if (payload?.type === 'refresh') {
          throwUnauthorizedException();
        }
        request.user = this.buildUser(payload);
        return true;
      } catch {
        // Access token is expired/invalid -> attempt a transparent refresh.
      }
    }

    // 2) Silent backend refresh: exchange a valid refresh-token cookie for a
    //    new access/refresh pair and continue the original request.
    if (refreshToken) {
      const expectedUserId = this.decodeSubject(accessToken);
      try {
        const result = await this.authService.refreshTokens(
          refreshToken,
          expectedUserId,
        );
        response.cookie(
          ACCESS_TOKEN_COOKIE,
          result.access_token,
          accessCookieOptions,
        );
        response.cookie(
          REFRESH_TOKEN_COOKIE,
          result.refresh_token,
          refreshCookieOptions,
        );
        request.user = this.buildUser(result.userPayload);
        return true;
      } catch {
        // Refresh failed -> fall through to 401.
      }
    }

    throwUnauthorizedException();
  }

  private decodeSubject(accessToken: string | undefined): number | undefined {
    if (!accessToken) {
      return undefined;
    }
    try {
      const payload = this.jwtService.decode<JwtPayload>(accessToken);
      return payload?.sub;
    } catch {
      return undefined;
    }
  }

  private buildUser(payload: JwtPayload) {
    return {
      sub: payload.sub,
      userId: payload.sub,
      currentUserId: payload.userId,
      email: payload.email,
      role: payload.role,
    };
  }
}
