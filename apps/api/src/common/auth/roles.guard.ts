import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { CurrentUser } from './current-user.type';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ALLOW_ANY_AUTHENTICATED_KEY } from './allow-any-authenticated.decorator';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 1. If route is marked as @Public(), allow access without role check
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: CurrentUser }>();
    if (!request.user) {
      return false;
    }

    // 2. If route is marked @AllowAnyAuthenticated(), allow any authenticated user
    const allowAny = this.reflector.getAllAndOverride<boolean>(
      ALLOW_ANY_AUTHENTICATED_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowAny) {
      return true;
    }

    // 3. If explicit roles are specified, check if user's role is permitted
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (requiredRoles && requiredRoles.length > 0) {
      return requiredRoles.includes(request.user.role);
    }

    // 4. Default Fail-Safe (Deny-All): Any endpoint missing authorization metadata is blocked
    return false;
  }
}
