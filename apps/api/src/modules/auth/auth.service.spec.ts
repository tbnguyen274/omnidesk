import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole, UserStatus } from '@prisma/client';
import { hash } from 'bcryptjs';
import { AuthService } from './auth.service';
import { AuditLogService, SYSTEM_DUMMY_UUID } from '../audit-log/audit-log.service';
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
  let auditLog: {
    log: jest.Mock;
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
    auditLog = {
      log: jest.fn().mockResolvedValue({ id: 'audit-log-id' }),
    };

    authService = new AuthService(
      usersService as unknown as UsersService,
      jwtService as unknown as JwtService,
      mailService as never,
      auditLog as unknown as AuditLogService,
    );
  });

  it('returns an access token and logs audit success for valid credentials', async () => {
    const user = createUser({
      passwordHash: await hash('password', 10),
    });
    usersService.findByEmail.mockResolvedValue(user);

    const result = await authService.login(
      {
        email: 'agent@omnidesk.local',
        password: 'password',
      },
      { ip: '127.0.0.1', userAgent: 'JestTest' },
    );

    expect(result).toMatchObject({
      accessToken: 'jwt-token',
      refreshToken: 'jwt-token',
      user: {
        email: 'agent@omnidesk.local',
        role: UserRole.AGENT,
      },
    });

    expect(auditLog.log).toHaveBeenCalledWith({
      actorId: user.id,
      action: 'auth.login.success',
      targetType: 'User',
      targetId: user.id,
      metadata: {
        ip: '127.0.0.1',
        userAgent: 'JestTest',
        method: 'password',
      },
    });
  });

  it('rejects invalid credentials and logs audit failure for unknown email', async () => {
    usersService.findByEmail.mockResolvedValue(null);

    await expect(
      authService.login(
        {
          email: 'missing@omnidesk.local',
          password: 'password',
        },
        { ip: '127.0.0.1', userAgent: 'JestTest' },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(auditLog.log).toHaveBeenCalledWith({
      actorId: null,
      action: 'auth.login.failure',
      targetType: 'User',
      targetId: SYSTEM_DUMMY_UUID,
      metadata: {
        ip: '127.0.0.1',
        userAgent: 'JestTest',
        attemptedEmail: 'missing@omnidesk.local',
        reason: 'user_not_found',
      },
    });
  });

  it('rejects invalid credentials and logs audit failure for inactive user', async () => {
    const inactiveUser = createUser({ status: UserStatus.INACTIVE });
    usersService.findByEmail.mockResolvedValue(inactiveUser);

    await expect(
      authService.login(
        {
          email: 'inactive@omnidesk.local',
          password: 'password',
        },
        { ip: '10.0.0.1' },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(auditLog.log).toHaveBeenCalledWith({
      actorId: null,
      action: 'auth.login.failure',
      targetType: 'User',
      targetId: inactiveUser.id,
      metadata: {
        ip: '10.0.0.1',
        userAgent: undefined,
        attemptedEmail: 'inactive@omnidesk.local',
        reason: 'user_inactive',
      },
    });
  });

  it('rejects wrong password and logs audit failure', async () => {
    const user = createUser({
      passwordHash: await hash('correct-password', 10),
    });
    usersService.findByEmail.mockResolvedValue(user);

    await expect(
      authService.login(
        {
          email: 'agent@omnidesk.local',
          password: 'wrong-password',
        },
        { ip: '192.168.1.1', userAgent: 'Mozilla' },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(auditLog.log).toHaveBeenCalledWith({
      actorId: null,
      action: 'auth.login.failure',
      targetType: 'User',
      targetId: user.id,
      metadata: {
        ip: '192.168.1.1',
        userAgent: 'Mozilla',
        attemptedEmail: 'agent@omnidesk.local',
        reason: 'invalid_credentials',
      },
    });
  });

  it('logs audit event on logout', async () => {
    await authService.logout('user-id', { ip: '127.0.0.1', userAgent: 'Chrome' });

    expect(usersService.removeRefreshToken).toHaveBeenCalledWith('user-id');
    expect(auditLog.log).toHaveBeenCalledWith({
      actorId: 'user-id',
      action: 'auth.logout',
      targetType: 'User',
      targetId: 'user-id',
      metadata: {
        ip: '127.0.0.1',
        userAgent: 'Chrome',
      },
    });
  });

  it('sends forgot-password email and logs audit event', async () => {
    const user = createUser();
    usersService.findByEmail.mockResolvedValue(user);

    await expect(
      authService.forgotPassword(
        { email: 'agent@omnidesk.local' },
        { ip: '127.0.0.1', userAgent: 'AgentApp' },
      ),
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
    expect(auditLog.log).toHaveBeenCalledWith({
      actorId: user.id,
      action: 'auth.password_reset.requested',
      targetType: 'User',
      targetId: user.id,
      metadata: {
        ip: '127.0.0.1',
        userAgent: 'AgentApp',
        email: 'agent@omnidesk.local',
      },
    });
  });

  describe('resetPassword', () => {
    it('resets password successfully and logs audit event', async () => {
      const user = createUser();
      usersService.findByPasswordResetToken.mockResolvedValue(user);

      const result = await authService.resetPassword(
        {
          token: 'valid-raw-token',
          newPassword: 'NewSecurePassword123!',
        },
        { ip: '127.0.0.1', userAgent: 'Browser' },
      );

      expect(result).toEqual({ success: true });
      expect(usersService.findByPasswordResetToken).toHaveBeenCalledWith(
        'valid-raw-token',
      );
      expect(usersService.updatePasswordAndClearToken).toHaveBeenCalledWith(
        user.id,
        expect.any(String),
      );
      expect(usersService.removeRefreshToken).toHaveBeenCalledWith(user.id);
      expect(auditLog.log).toHaveBeenCalledWith({
        actorId: user.id,
        action: 'auth.password_reset.completed',
        targetType: 'User',
        targetId: user.id,
        metadata: {
          ip: '127.0.0.1',
          userAgent: 'Browser',
        },
      });
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
