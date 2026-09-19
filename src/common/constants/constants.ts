import { CookieOptions } from 'express';

export enum Role {
  SUPER_ADMIN = 'Super Admin',
  ADMIN = 'Admin',
  CHEF = 'Chef',
  WAITER = 'Waiter',
  CUSTOMER = 'Customer',
}

export const originUrl = [
  'https://secretcafe.vercel.app',
  'http://localhost:3000',
  'https://localhost',
  'capacitor://localhost',
];

export const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.APP_ENV === 'production',
  sameSite: process.env.APP_ENV === 'production' ? 'none' : 'lax',
  path: '/',
  maxAge: 24 * 60 * 60 * 1000,
};

export const JWT_ACCESS_EXPIRES_IN = '15m';
export const JWT_REFRESH_EXPIRES_IN = '7d';

export const ACCESS_TOKEN_COOKIE = 'token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

export const accessCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.APP_ENV === 'production',
  sameSite: process.env.APP_ENV === 'production' ? 'none' : 'lax',
  path: '/',
  maxAge: 15 * 60 * 1000,
};

export const refreshCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.APP_ENV === 'production',
  sameSite: process.env.APP_ENV === 'production' ? 'none' : 'lax',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};
