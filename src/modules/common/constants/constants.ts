import { CookieOptions } from 'express';

export enum Role {
    SUPER_ADMIN = 'Super Admin',
    ADMIN = 'Admin',
    CHEF = 'Chef',
    WAITER = 'Waiter',
    CUSTOMER = 'Customer',
}

export const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.APP_ENV === 'production',
  sameSite: process.env.APP_ENV === 'production' ? 'none' : 'lax',
  path: '/',
  maxAge: 24 * 60 * 60 * 1000,
};