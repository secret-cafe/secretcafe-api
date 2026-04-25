// auth.controller.ts
import { Body, Controller, Post, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import express from 'express';
import { cookieOptions } from 'src/common/constants/constants';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) { }

  @Post('login')
  async login(@Body() body: { email: string; password: string }, @Res({ passthrough: true }) res: express.Response) {

    const result = await this.authService.login(
      body.email,
      body.password,
    );

    res.cookie('token', result.access_token, cookieOptions);

    return {
      status: true,
      message: 'Login Successful',
    };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: express.Response) {
    res.clearCookie('token', cookieOptions);

    return { 
      status: true, 
      message: 'Logged out successfully' 
    };
  }
}