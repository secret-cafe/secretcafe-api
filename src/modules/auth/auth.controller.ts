// auth.controller.ts
import { Body, Controller, Post, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import express from 'express';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) { }

  @Post('login')
  async login(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const result = await this.authService.login(
      body.email,
      body.password,
    );

    res.cookie('token', result.access_token, {
      httpOnly: true,
      secure: true, // true in production (HTTPS)
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    });

    return {
      status: true,
      message: 'Login successful',
      user: result.user,
    };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: express.Response) {
    res.clearCookie('token');

    return { 
      status: true, 
      message: 'Logged out successfully' 
    };
  }
}