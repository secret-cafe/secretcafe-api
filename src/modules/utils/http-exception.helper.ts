// utils/http-exception.helper.ts
import { UnauthorizedException, NotFoundException } from '@nestjs/common';

export function throwUnauthorizedException(message = 'Invalid credentials') {
  throw new UnauthorizedException({
    status: false,
    message,
    error: 'Unauthorized',
    statusCode: 401,
  });
}

export function throwNotFoundException(message = 'User not found') {
  throw new NotFoundException({
    status: false,
    message,
    error: 'Not Found',
    statusCode: 404,
  });
}