import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole, UserStatus } from '@prisma/client';
import { hash } from 'bcryptjs';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: jest.Mocked<Pick<UsersService, 'findByEmail' | 'setCurrentRefreshToken'>>;
  let jwtService: jest.Mocked<Pick<JwtService, 'signAsync'>>;

  beforeEach(() => {
    usersService = {
      findByEmail: jest.fn(),
      setCurrentRefreshToken: jest.fn(),
    };
    jwtService = {
      signAsync: jest.fn().mockResolvedValue('jwt-token'),
    };

    authService = new AuthService(
      usersService as unknown as UsersService,
      jwtService as unknown as JwtService,
    );
  });

  it('returns an access token for valid credentials', async () => {
    usersService.findByEmail.mockResolvedValue({
      id: 'user-id',
      name: 'Agent',
      email: 'agent@omnidesk.local',
      passwordHash: await hash('password', 10),
      role: UserRole.AGENT,
      status: UserStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
      hashedRefreshToken: null,
    });

    await expect(
      authService.login({
        email: 'agent@omnidesk.local',
        password: 'password',
      }),
    ).resolves.toMatchObject({
      accessToken: 'jwt-token',
      refreshToken: 'jwt-token',
      user: {
        email: 'agent@omnidesk.local',
        role: UserRole.AGENT,
      },
    });
  });

  it('rejects invalid credentials', async () => {
    usersService.findByEmail.mockResolvedValue(null);

    await expect(
      authService.login({
        email: 'missing@omnidesk.local',
        password: 'password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
