import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole, UserStatus } from '@prisma/client';
import { hash } from 'bcryptjs';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: jest.Mocked<
    Pick<
      UsersService,
      'findByEmail' | 'setCurrentRefreshToken' | 'setPasswordResetToken'
    >
  >;
  let jwtService: jest.Mocked<Pick<JwtService, 'signAsync'>>;
  let mailService: {
    sendMail: jest.Mock;
    sendPasswordResetEmail: jest.Mock;
    sendWelcomeEmail: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    usersService = {
      findByEmail: jest.fn(),
      setCurrentRefreshToken: jest.fn(),
      setPasswordResetToken: jest.fn(),
    };
    jwtService = {
      signAsync: jest.fn().mockResolvedValue('jwt-token'),
    };
    mailService = {
      sendMail: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
      sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
    };

    authService = new AuthService(
      usersService as unknown as UsersService,
      jwtService as unknown as JwtService,
      mailService as never,
    );
  });

  it('returns an access token for valid credentials', async () => {
    usersService.findByEmail.mockResolvedValue(
      createUser({
        passwordHash: await hash('password', 10),
      }),
    );

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

  it('sends forgot-password email by delegating to mailService', async () => {
    usersService.findByEmail.mockResolvedValue(createUser());

    await expect(
      authService.forgotPassword({ email: 'agent@omnidesk.local' }),
    ).resolves.toEqual({ success: true });

    expect(usersService.setPasswordResetToken).toHaveBeenCalledWith(
      'agent@omnidesk.local',
      expect.any(String),
      expect.any(Date),
    );
    expect(mailService.sendPasswordResetEmail).toHaveBeenCalledWith(
      'agent@omnidesk.local',
      expect.stringContaining('/auth/reset-password?token='),
    );
  });
});

function createUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-id',
    name: 'Agent',
    email: 'agent@omnidesk.local',
    passwordHash: 'hash',
    role: UserRole.AGENT,
    status: UserStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    hashedRefreshToken: null,
    passwordResetToken: null,
    passwordResetExpires: null,
    ...overrides,
  };
}
