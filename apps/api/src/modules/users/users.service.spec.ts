import * as crypto from 'crypto';
import { UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import { AuditLogService } from '../audit-log/audit-log.service';
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
  let auditLog: {
    log: jest.Mock;
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
    auditLog = {
      log: jest.fn().mockResolvedValue({ id: 'audit-log-id' }),
    };

    service = new UsersService(
      prisma as unknown as PrismaService,
      mailService as unknown as MailService,
      auditLog as unknown as AuditLogService,
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
    it('stores hashed token in DB, sends welcome email, and logs audit event', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }) => ({
        id: 'user-123',
        name: data.name,
        email: data.email,
        role: data.role,
        status: UserStatus.ACTIVE,
        createdAt: new Date(),
      }));

      await service.create(
        {
          name: 'New Agent',
          email: 'agent@example.com',
          role: UserRole.AGENT,
        },
        'admin-creator-id',
      );

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

      // Audit log must be called
      expect(auditLog.log).toHaveBeenCalledWith({
        actorId: 'admin-creator-id',
        action: 'user.created',
        targetType: 'User',
        targetId: 'user-123',
        metadata: {
          email: 'agent@example.com',
          role: UserRole.AGENT,
          createdBy: 'admin-creator-id',
        },
      });
    });
  });

  describe('updateStatus', () => {
    it('updates user status and logs audit event', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-456',
        name: 'User 456',
        email: 'u456@example.com',
        role: UserRole.AGENT,
        status: UserStatus.ACTIVE,
      });
      prisma.user.update.mockResolvedValue({
        id: 'user-456',
        name: 'User 456',
        email: 'u456@example.com',
        role: UserRole.AGENT,
        status: UserStatus.INACTIVE,
      });

      const result = await service.updateStatus(
        'user-456',
        { status: UserStatus.INACTIVE },
        'admin-actor-id',
      );

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-456' },
        data: { status: UserStatus.INACTIVE },
        select: expect.any(Object),
      });
      expect(auditLog.log).toHaveBeenCalledWith({
        actorId: 'admin-actor-id',
        action: 'user.status_updated',
        targetType: 'User',
        targetId: 'user-456',
        metadata: {
          email: 'u456@example.com',
          previousStatus: UserStatus.ACTIVE,
          newStatus: UserStatus.INACTIVE,
        },
      });
      expect(result).toBeDefined();
    });
  });
});
