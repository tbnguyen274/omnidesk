import { PrismaService } from '../../common/database/prisma.service';
import { AuditLogService, SYSTEM_DUMMY_UUID } from './audit-log.service';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let prisma: {
    auditLog: {
      create: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      auditLog: {
        create: jest.fn(),
      },
    };
    service = new AuditLogService(prisma as unknown as PrismaService);
  });

  it('creates an audit log entry with full details', async () => {
    const mockCreated = {
      id: 'audit-log-uuid',
      actorId: 'user-uuid',
      action: 'auth.login.success',
      targetType: 'User',
      targetId: 'user-uuid',
      metadata: { ip: '127.0.0.1', userAgent: 'test-agent', method: 'password' },
      createdAt: new Date(),
    };

    prisma.auditLog.create.mockResolvedValueOnce(mockCreated);

    const result = await service.log({
      actorId: 'user-uuid',
      action: 'auth.login.success',
      targetType: 'User',
      targetId: 'user-uuid',
      metadata: { ip: '127.0.0.1', userAgent: 'test-agent', method: 'password' },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'user-uuid',
        action: 'auth.login.success',
        targetType: 'User',
        targetId: 'user-uuid',
        metadata: { ip: '127.0.0.1', userAgent: 'test-agent', method: 'password' },
      },
    });
    expect(result).toEqual(mockCreated);
  });

  it('sets actorId to null if omitted and handles SYSTEM_DUMMY_UUID', async () => {
    prisma.auditLog.create.mockResolvedValueOnce({ id: 'dummy-log-id' });

    await service.log({
      action: 'auth.login.failure',
      targetType: 'User',
      targetId: SYSTEM_DUMMY_UUID,
      metadata: { attemptedEmail: 'unknown@example.com', reason: 'user_not_found' },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: null,
        action: 'auth.login.failure',
        targetType: 'User',
        targetId: SYSTEM_DUMMY_UUID,
        metadata: { attemptedEmail: 'unknown@example.com', reason: 'user_not_found' },
      },
    });
  });

  it('defaults metadata to empty object if omitted in input', async () => {
    prisma.auditLog.create.mockResolvedValueOnce({ id: 'dummy-log-no-metadata' });

    await service.log({
      actorId: 'user-uuid',
      action: 'auth.logout',
      targetType: 'User',
      targetId: 'user-uuid',
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'user-uuid',
        action: 'auth.logout',
        targetType: 'User',
        targetId: 'user-uuid',
        metadata: {},
      },
    });
  });
});
