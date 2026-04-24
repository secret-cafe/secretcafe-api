import { CookieOptions } from 'express';

export enum Role {
    SUPER_ADMIN = 'super admin',
    ADMIN = 'admin',
    CHEF = 'chef',
    WAITER = 'waiter',
    CUSTOMER = 'customer',
}

export const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.APP_ENV === 'production',
  sameSite: process.env.APP_ENV === 'production' ? 'none' : 'lax',
  path: '/',
  maxAge: 24 * 60 * 60 * 1000,
};