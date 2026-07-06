import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { DashboardController } from '../../modules/dashboard/dashboard.controller';
import { UsersController } from '../../modules/users/users.controller';
import { ROLES_KEY } from './roles.decorator';
import { RolesGuard } from './roles.guard';

describe('RolesGuard coverage for admin surfaces', () => {
  const reflector = new Reflector();

  it('protects dashboard controller with ADMIN role metadata', () => {
    expect(reflector.get<UserRole[]>(ROLES_KEY, DashboardController)).toEqual([
      UserRole.ADMIN,
    ]);
  });

  it('protects users management endpoints with expected role metadata', () => {
    expect(
      reflector.get<UserRole[]>(ROLES_KEY, getUsersControllerMethod('findAll')),
    ).toEqual([UserRole.ADMIN]);
    expect(
      reflector.get<UserRole[]>(ROLES_KEY, getUsersControllerMethod('create')),
    ).toEqual([UserRole.ADMIN]);
    expect(
      reflector.get<UserRole[]>(
        ROLES_KEY,
        getUsersControllerMethod('updateStatus'),
      ),
    ).toEqual([UserRole.ADMIN]);
    expect(
      reflector.get<UserRole[]>(
        ROLES_KEY,
        getUsersControllerMethod('getAgents'),
      ),
    ).toEqual([UserRole.ADMIN, UserRole.AGENT]);
  });

  it('allows only users whose role is included in route metadata', () => {
    const guard = new RolesGuard({
      getAllAndOverride: jest.fn().mockReturnValue([UserRole.ADMIN]),
    } as unknown as Reflector);

    expect(guard.canActivate(createContext(UserRole.ADMIN))).toBe(true);
    expect(guard.canActivate(createContext(UserRole.AGENT))).toBe(false);
  });
});

function getUsersControllerMethod(methodName: keyof UsersController) {
  return Reflect.get(UsersController.prototype, methodName) as (
    ...args: unknown[]
  ) => unknown;
}

function createContext(role: UserRole): ExecutionContext {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    getArgs: jest.fn(),
    getArgByIndex: jest.fn(),
    switchToRpc: jest.fn(),
    switchToWs: jest.fn(),
    getType: jest.fn().mockReturnValue('http'),
    switchToHttp: () => ({
      getRequest: () => ({
        user: {
          id: 'user-id',
          email: 'user@example.com',
          role,
        },
      }),
    }),
  } as unknown as ExecutionContext;
}
