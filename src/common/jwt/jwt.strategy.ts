// jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { throwUnauthorizedException } from 'src/common/utils/http-exception.helper';

interface JwtPayload {
  sub?: number;
  userId?: string;
  email?: string;
  role?: string;
  type?: string;
}

interface CookieRequest {
  cookies?: Record<string, unknown>;
}

const cookieExtractor = (req?: CookieRequest) => {
  if (!req?.cookies) {
    return null;
  }
  const token = req.cookies.token;
  return typeof token === 'string' ? token : null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: cookieExtractor,
      ignoreExpiration: false,
      secretOrKey: 'SUPER_SECRET_KEY',
    });
  }

  validate(payload: JwtPayload) {
    // Refresh tokens must never be accepted as access tokens.
    if (payload?.type !== undefined && payload.type !== 'access') {
      throwUnauthorizedException();
    }

    return {
      sub: payload.sub,
      userId: payload.sub,
      currentUserId: payload.userId,
      email: payload.email,
      role: payload.role,
    };
  }
}
