import * as crypto from 'crypto';
import { UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let mailService: {
    sendWelcomeEmail: jest.Mock;
    sendPasswordResetEmail: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };
    mailService = {
      sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    };

    service = new UsersService(
      prisma as unknown as PrismaService,
      mailService as unknown as MailService,
    );
  });

  describe('setPasswordResetToken', () => {
    it('hashes the token with SHA-256 before updating database', async () => {
      const email = 'user@example.com';
      const rawToken = 'd8e3b4a2-1111-4444-9999-abcdef123456';
      const expires = new Date();

      const expectedHash = crypto
        .createHash('sha256')
        .update(rawToken)
        .digest('hex');

      await service.setPasswordResetToken(email, rawToken, expires);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { email },
        data: {
          passwordResetToken: expectedHash,
          passwordResetExpires: expires,
        },
      });
      // Verify stored token is NOT the raw token
      const updateData = prisma.user.update.mock.calls[0][0].data;
      expect(updateData.passwordResetToken).not.toBe(rawToken);
      expect(updateData.passwordResetToken).toHaveLength(64);
    });
  });

  describe('findByPasswordResetToken', () => {
    it('queries database with SHA-256 hashed token', async () => {
      const rawToken = 'test-token-uuid';
      const expectedHash = crypto
        .createHash('sha256')
        .update(rawToken)
        .digest('hex');

      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        status: UserStatus.ACTIVE,
      });

      const result = await service.findByPasswordResetToken(rawToken);

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          passwordResetToken: expectedHash,
          passwordResetExpires: {
            gt: expect.any(Date),
          },
        },
      });
      expect(result).toBeDefined();
    });
  });

  describe('create', () => {
    it('stores hashed token in DB and sends raw token in welcome email link', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }) => ({
        id: 'user-123',
        name: data.name,
        email: data.email,
        role: data.role,
        status: UserStatus.ACTIVE,
        createdAt: new Date(),
      }));

      await service.create({
        name: 'New Agent',
        email: 'agent@example.com',
        role: UserRole.AGENT,
      });

      expect(prisma.user.create).toHaveBeenCalled();
      const createData = prisma.user.create.mock.calls[0][0].data;

      // Stored token must be 64-char SHA-256 hex
      expect(createData.passwordResetToken).toHaveLength(64);

      // Email must be called with a resetUrl containing the raw token
      expect(mailService.sendWelcomeEmail).toHaveBeenCalled();
      const welcomeCall = mailService.sendWelcomeEmail.mock.calls[0];
      const resetUrl = welcomeCall[1];

      // Extract token param from url
      const urlTokenMatch = resetUrl.match(/token=([^&]+)/);
      expect(urlTokenMatch).toBeTruthy();
      const rawTokenFromUrl = urlTokenMatch[1];

      // Verify that sha256(rawTokenFromUrl) === createData.passwordResetToken
      const hashOfUrlToken = crypto
        .createHash('sha256')
        .update(rawTokenFromUrl)
        .digest('hex');
      expect(hashOfUrlToken).toBe(createData.passwordResetToken);
    });
  });
});
