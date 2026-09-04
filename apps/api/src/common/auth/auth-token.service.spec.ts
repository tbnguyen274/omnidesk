import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { UsersService } from '../../modules/users/users.service';
import { AuthTokenService } from './auth-token.service';

describe('AuthTokenService', () => {
  let service: AuthTokenService;
  let jwtService: {
    verifyAsync: jest.Mock;
  };
  let usersService: {
    findById: jest.Mock;
  };

  beforeEach(() => {
    jwtService = {
      verifyAsync: jest.fn(),
    };
    usersService = {
      findById: jest.fn(),
    };
    service = new AuthTokenService(
      jwtService as unknown as JwtService,
      usersService as unknown as UsersService,
    );
  });

  describe('validatePayload', () => {
    it('throws UnauthorizedException if payload sub is missing', async () => {
      await expect(
        service.validatePayload({ sub: '', email: 'test@example.com', role: UserRole.AGENT }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException if user not found', async () => {
      usersService.findById.mockResolvedValueOnce(null);

      await expect(
        service.validatePayload({ sub: 'user-1', email: 'test@example.com', role: UserRole.AGENT }),
      ).rejects.toThrow(UnauthorizedException);
      expect(usersService.findById).toHaveBeenCalledWith('user-1');
    });

    it('throws UnauthorizedException if user is not ACTIVE', async () => {
      usersService.findById.mockResolvedValueOnce({
        id: 'user-1',
        name: 'Inactive User',
        email: 'inactive@example.com',
        role: UserRole.AGENT,
        status: 'INACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        service.validatePayload({ sub: 'user-1', email: 'inactive@example.com', role: UserRole.AGENT }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns AuthenticatedUser when user is ACTIVE', async () => {
      usersService.findById.mockResolvedValueOnce({
        id: 'user-1',
        name: 'Active Agent',
        email: 'agent@example.com',
        role: UserRole.AGENT,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.validatePayload({
        sub: 'user-1',
        email: 'agent@example.com',
        role: UserRole.AGENT,
      });

      expect(result).toEqual({
        id: 'user-1',
        name: 'Active Agent',
        email: 'agent@example.com',
        role: UserRole.AGENT,
      });
    });
  });

  describe('validateToken', () => {
    it('throws UnauthorizedException if token is empty or invalid type', async () => {
      await expect(service.validateToken('')).rejects.toThrow(UnauthorizedException);
      await expect(service.validateToken(null as unknown as string)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException if jwtService.verifyAsync fails', async () => {
      jwtService.verifyAsync.mockRejectedValueOnce(new Error('jwt expired'));

      await expect(service.validateToken('expired.jwt.token')).rejects.toThrow(UnauthorizedException);
    });

    it('validates and returns AuthenticatedUser for a valid token', async () => {
      jwtService.verifyAsync.mockResolvedValueOnce({
        sub: 'user-1',
        email: 'admin@example.com',
        role: UserRole.ADMIN,
      });
      usersService.findById.mockResolvedValueOnce({
        id: 'user-1',
        name: 'Admin User',
        email: 'admin@example.com',
        role: UserRole.ADMIN,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.validateToken('valid.jwt.token');

      expect(result).toEqual({
        id: 'user-1',
        name: 'Admin User',
        email: 'admin@example.com',
        role: UserRole.ADMIN,
      });
    });

    it('re-throws UnauthorizedException from validatePayload when user is INACTIVE', async () => {
      jwtService.verifyAsync.mockResolvedValueOnce({
        sub: 'user-inactive',
        email: 'inactive@example.com',
        role: UserRole.AGENT,
      });
      usersService.findById.mockResolvedValueOnce({
        id: 'user-inactive',
        name: 'Inactive User',
        email: 'inactive@example.com',
        role: UserRole.AGENT,
        status: 'INACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        service.validateToken('valid.jwt.but.inactive.user'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
