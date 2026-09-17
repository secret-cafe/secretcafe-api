// auth.controller.ts
import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import express from 'express';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  Role,
  accessCookieOptions,
  refreshCookieOptions,
} from 'src/common/constants/constants';
import { throwUnauthorizedException } from 'src/common/utils/http-exception.helper';
import { Auth } from 'src/common/decorators/auth.decorator';
import { UserService } from '../users/users.service';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService, private readonly userService: UserService) { }

  @Post('login')
  async login(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const result = await this.authService.login(body.email, body.password);

    res.cookie(ACCESS_TOKEN_COOKIE, result.access_token, accessCookieOptions);
    res.cookie(
      REFRESH_TOKEN_COOKIE,
      result.refresh_token,
      refreshCookieOptions,
    );

    return {
      status: true,
      message: 'Login Successful',
    };
  }

  @Post('refresh')
  async refresh(
    @Req() req: express.Request,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE] as
      | string
      | undefined;
    if (!refreshToken) {
      throwUnauthorizedException('Refresh token missing');
    }

    const result = await this.authService.refreshTokens(refreshToken);

    res.cookie(ACCESS_TOKEN_COOKIE, result.access_token, accessCookieOptions);
    res.cookie(
      REFRESH_TOKEN_COOKIE,
      result.refresh_token,
      refreshCookieOptions,
    );

    return {
      status: true,
      message: 'Session refreshed',
    };
  }

  @Get('profile')
  @Auth(Role.SUPER_ADMIN, Role.ADMIN, Role.CHEF, Role.WAITER)
  getProfile(@Req() req: any) {
    return this.userService.findOne(req.user.currentUserId);
  }

  @Post('logout')
  async logout(
    @Req() req: express.Request,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    await this.authService.logout(
      req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined,
    );

    res.clearCookie(ACCESS_TOKEN_COOKIE, accessCookieOptions);
    res.clearCookie(REFRESH_TOKEN_COOKIE, refreshCookieOptions);

    return {
      status: true,
      message: 'Logged out successfully',
    };
  }
}
