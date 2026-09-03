import { BadRequestException, UnauthorizedException } from '@nestjs/common';
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
      | 'findByEmail'
      | 'setCurrentRefreshToken'
      | 'setPasswordResetToken'
      | 'findByPasswordResetToken'
      | 'updatePasswordAndClearToken'
      | 'removeRefreshToken'
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
      findByPasswordResetToken: jest.fn(),
      updatePasswordAndClearToken: jest.fn(),
      removeRefreshToken: jest.fn(),
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

  describe('resetPassword', () => {
    it('resets password successfully when token is valid and user is active', async () => {
      const user = createUser();
      usersService.findByPasswordResetToken.mockResolvedValue(user);

      const result = await authService.resetPassword({
        token: 'valid-raw-token',
        newPassword: 'NewSecurePassword123!',
      });

      expect(result).toEqual({ success: true });
      expect(usersService.findByPasswordResetToken).toHaveBeenCalledWith(
        'valid-raw-token',
      );
      expect(usersService.updatePasswordAndClearToken).toHaveBeenCalledWith(
        user.id,
        expect.any(String),
      );
      expect(usersService.removeRefreshToken).toHaveBeenCalledWith(user.id);
    });

    it('rejects reset password if token is invalid or expired', async () => {
      usersService.findByPasswordResetToken.mockResolvedValue(null);

      await expect(
        authService.resetPassword({
          token: 'invalid-or-expired-token',
          newPassword: 'NewPassword123!',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(usersService.updatePasswordAndClearToken).not.toHaveBeenCalled();
    });

    it('rejects reset password if user is not active', async () => {
      const inactiveUser = createUser({ status: UserStatus.INACTIVE });
      usersService.findByPasswordResetToken.mockResolvedValue(inactiveUser);

      await expect(
        authService.resetPassword({
          token: 'some-token',
          newPassword: 'NewPassword123!',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(usersService.updatePasswordAndClearToken).not.toHaveBeenCalled();
    });
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
