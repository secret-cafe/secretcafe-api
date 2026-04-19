import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../constants/constants';
import { throwForbiddenException, throwNotFoundException } from 'src/modules/utils/http-exception.helper';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) { }

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throwNotFoundException('User not found');
    }

    const hasRole = requiredRoles.some(role => user.role === role);
    if (!hasRole) {
      throwForbiddenException('Access Denied');
    }

    return true;
  }
}