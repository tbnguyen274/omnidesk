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
      getAllAndOverride: jest.fn().mockImplementation((key) => {
        if (key === ROLES_KEY) return [UserRole.ADMIN];
        return undefined;
      }),
    } as unknown as Reflector);

    expect(guard.canActivate(createContext(UserRole.ADMIN))).toBe(true);
    expect(guard.canActivate(createContext(UserRole.AGENT))).toBe(false);
  });

  it('allows public routes marked with @Public() without user check', () => {
    const guard = new RolesGuard({
      getAllAndOverride: jest.fn().mockImplementation((key) => {
        if (key === 'isPublic') return true;
        return undefined;
      }),
    } as unknown as Reflector);

    const publicContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => ({}) }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(publicContext)).toBe(true);
  });

  it('allows any authenticated user when marked with @AllowAnyAuthenticated()', () => {
    const guard = new RolesGuard({
      getAllAndOverride: jest.fn().mockImplementation((key) => {
        if (key === 'allowAnyAuthenticated') return true;
        return undefined;
      }),
    } as unknown as Reflector);

    expect(guard.canActivate(createContext(UserRole.ADMIN))).toBe(true);
    expect(guard.canActivate(createContext(UserRole.AGENT))).toBe(true);
  });

  it('denies access by default (Deny-All) when no metadata is provided', () => {
    const guard = new RolesGuard({
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector);

    expect(guard.canActivate(createContext(UserRole.ADMIN))).toBe(false);
    expect(guard.canActivate(createContext(UserRole.AGENT))).toBe(false);
  });

  it('denies access when request has no user and route is not public', () => {
    const guard = new RolesGuard({
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector);

    const noUserContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => ({}) }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(noUserContext)).toBe(false);
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
