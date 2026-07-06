import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole, UserStatus } from '@prisma/client';
import { hash } from 'bcryptjs';
import { AuthService } from './auth.service';
import { providerConfig } from '../../config/provider.config';
import { UsersService } from '../users/users.service';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

import * as nodemailer from 'nodemailer';

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: jest.Mocked<
    Pick<
      UsersService,
      'findByEmail' | 'setCurrentRefreshToken' | 'setPasswordResetToken'
    >
  >;
  let jwtService: jest.Mocked<Pick<JwtService, 'signAsync'>>;
  const originalOutboundMode = providerConfig.email.outboundMode;
  const originalSmtpConfig = { ...providerConfig.email.smtp };

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

    authService = new AuthService(
      usersService as unknown as UsersService,
      jwtService as unknown as JwtService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Object.assign(providerConfig.email, { outboundMode: originalOutboundMode });
    Object.assign(providerConfig.email.smtp, originalSmtpConfig);
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

  it('sends forgot-password email through SMTP when outbound mode is live', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'smtp-1' });
    jest.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail,
    } as unknown as ReturnType<typeof nodemailer.createTransport>);
    Object.assign(providerConfig.email, { outboundMode: 'live' });
    Object.assign(providerConfig.email.smtp, {
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      user: 'support@example.com',
      password: 'app-password',
      fromAddress: 'support@example.com',
    });
    usersService.findByEmail.mockResolvedValue(createUser());

    await expect(
      authService.forgotPassword({ email: 'agent@omnidesk.local' }),
    ).resolves.toEqual({ success: true });

    expect(usersService.setPasswordResetToken).toHaveBeenCalledWith(
      'agent@omnidesk.local',
      expect.any(String),
      expect.any(Date),
    );
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.com',
        auth: {
          user: 'support@example.com',
          pass: 'app-password',
        },
      }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'support@example.com',
        to: 'agent@omnidesk.local',
        subject: 'Password Reset Request',
      }),
    );
  });

  it('logs forgot-password reset URL in mock mode without SMTP delivery', async () => {
    const createTransport = jest.spyOn(nodemailer, 'createTransport');
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    Object.assign(providerConfig.email, { outboundMode: 'mock' });
    Object.assign(providerConfig.email.smtp, { host: undefined });
    usersService.findByEmail.mockResolvedValue(createUser());

    await expect(
      authService.forgotPassword({ email: 'agent@omnidesk.local' }),
    ).resolves.toEqual({ success: true });

    expect(createTransport).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Mock Email] Password reset requested'),
    );
    expect(consoleSpy).toHaveBeenCalledWith(
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
