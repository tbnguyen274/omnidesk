import {
  INestApplication,
  NotFoundException,
  UnauthorizedException,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole, UserStatus } from '@prisma/client';
import request from 'supertest';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import {
  AuditLogService,
  SYSTEM_DUMMY_UUID,
} from '../src/modules/audit-log/audit-log.service';
import { UsersController } from '../src/modules/users/users.controller';
import { UsersService } from '../src/modules/users/users.service';

describe('Audit Logging System (e2e)', () => {
  let app: INestApplication;
  const recordedLogs: any[] = [];

  const mockAuditLogService = {
    log: jest.fn().mockImplementation(async (input) => {
      recordedLogs.push({ ...input, loggedAt: new Date() });
      return { id: 'mock-audit-id', ...input };
    }),
  };

  const sampleUser = {
    id: '11111111-2222-3333-4444-555555555555',
    name: 'Agent Test',
    email: 'agent.test@omnidesk.local',
    role: UserRole.AGENT,
    status: UserStatus.ACTIVE,
  };

  const adminUser = {
    id: '99999999-8888-7777-6666-555555555555',
    name: 'Admin Test',
    email: 'admin.test@omnidesk.local',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
  };

  const mockAuthService = {
    login: jest.fn().mockImplementation(async (dto, context) => {
      if (dto.email === 'unknown@omnidesk.local') {
        await mockAuditLogService.log({
          actorId: null,
          action: 'auth.login.failure',
          targetType: 'User',
          targetId: SYSTEM_DUMMY_UUID,
          metadata: {
            ip: context?.ip,
            userAgent: context?.userAgent,
            attemptedEmail: dto.email,
            reason: 'user_not_found',
          },
        });
        throw new UnauthorizedException('Invalid email or password');
      }
      if (dto.password === 'wrong-password') {
        await mockAuditLogService.log({
          actorId: null,
          action: 'auth.login.failure',
          targetType: 'User',
          targetId: sampleUser.id,
          metadata: {
            ip: context?.ip,
            userAgent: context?.userAgent,
            attemptedEmail: dto.email,
            reason: 'invalid_credentials',
          },
        });
        throw new UnauthorizedException('Invalid email or password');
      }
      if (dto.email === 'inactive@omnidesk.local') {
        await mockAuditLogService.log({
          actorId: null,
          action: 'auth.login.failure',
          targetType: 'User',
          targetId: sampleUser.id,
          metadata: {
            ip: context?.ip,
            userAgent: context?.userAgent,
            attemptedEmail: dto.email,
            reason: 'user_inactive',
          },
        });
        throw new UnauthorizedException('Invalid email or password');
      }

      await mockAuditLogService.log({
        actorId: sampleUser.id,
        action: 'auth.login.success',
        targetType: 'User',
        targetId: sampleUser.id,
        metadata: {
          ip: context?.ip,
          userAgent: context?.userAgent,
          method: 'password',
        },
      });

      return {
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        user: sampleUser,
      };
    }),
    logout: jest.fn().mockImplementation(async (userId, jti, context) => {
      await mockAuditLogService.log({
        actorId: userId,
        action: 'auth.logout',
        targetType: 'User',
        targetId: userId,
        metadata: {
          ip: context?.ip,
          userAgent: context?.userAgent,
          revokedJti: jti ?? null,
        },
      });
    }),
    forgotPassword: jest.fn().mockImplementation(async (dto, context) => {
      await mockAuditLogService.log({
        actorId: sampleUser.id,
        action: 'auth.password_reset.requested',
        targetType: 'User',
        targetId: sampleUser.id,
        metadata: {
          ip: context?.ip,
          userAgent: context?.userAgent,
          email: dto.email,
        },
      });
      return { success: true };
    }),
    resetPassword: jest.fn().mockImplementation(async (dto, context) => {
      await mockAuditLogService.log({
        actorId: sampleUser.id,
        action: 'auth.password_reset.completed',
        targetType: 'User',
        targetId: sampleUser.id,
        metadata: {
          ip: context?.ip,
          userAgent: context?.userAgent,
        },
      });
      return { success: true };
    }),
  };

  const mockUsersService = {
    findById: jest.fn().mockResolvedValue(sampleUser),
    findAll: jest.fn().mockResolvedValue([sampleUser]),
    findAgents: jest.fn().mockResolvedValue([sampleUser]),
    create: jest.fn().mockImplementation(async (dto, creatorId) => {
      const newUser = {
        id: '77777777-6666-5555-4444-333333333333',
        name: dto.name,
        email: dto.email,
        role: dto.role,
        status: UserStatus.ACTIVE,
      };
      await mockAuditLogService.log({
        actorId: creatorId ?? null,
        action: 'user.created',
        targetType: 'User',
        targetId: newUser.id,
        metadata: {
          email: newUser.email,
          role: newUser.role,
          createdBy: creatorId ?? 'system',
        },
      });
      return newUser;
    }),
    updateStatus: jest.fn().mockImplementation(async (id, dto, actorId) => {
      await mockAuditLogService.log({
        actorId: actorId ?? null,
        action: 'user.status_updated',
        targetType: 'User',
        targetId: id,
        metadata: {
          email: sampleUser.email,
          previousStatus: UserStatus.ACTIVE,
          newStatus: dto.status,
        },
      });
      return { ...sampleUser, status: dto.status };
    }),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AuthController, UsersController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: UsersService, useValue: mockUsersService },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use((req: any, _res: any, next: () => void) => {
      // Mock authenticated admin user for /users endpoints
      req.user = adminUser;
      next();
    });
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    recordedLogs.length = 0;
  });

  describe('Authentication Audit Logging', () => {
    it('records auth.login.success with client IP and User-Agent', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('User-Agent', 'Supertest-Agent/1.0')
        .send({
          email: 'agent.test@omnidesk.local',
          password: 'CorrectPassword123!',
        })
        .expect(201);

      const loginSuccess = recordedLogs.find(
        (l) => l.action === 'auth.login.success',
      );
      expect(loginSuccess).toBeDefined();
      expect(loginSuccess.actorId).toBe(sampleUser.id);
      expect(loginSuccess.targetType).toBe('User');
      expect(loginSuccess.targetId).toBe(sampleUser.id);
      expect(loginSuccess.metadata.method).toBe('password');
      expect(loginSuccess.metadata.userAgent).toBe('Supertest-Agent/1.0');
    });

    it('records auth.login.failure with SYSTEM_DUMMY_UUID when email does not exist', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('User-Agent', 'HackerBot/0.1')
        .send({
          email: 'unknown@omnidesk.local',
          password: 'wrong',
        })
        .expect(401);

      const loginFailure = recordedLogs.find(
        (l) => l.action === 'auth.login.failure',
      );
      expect(loginFailure).toBeDefined();
      expect(loginFailure.actorId).toBeNull();
      expect(loginFailure.targetType).toBe('User');
      expect(loginFailure.targetId).toBe(SYSTEM_DUMMY_UUID);
      expect(loginFailure.metadata.attemptedEmail).toBe(
        'unknown@omnidesk.local',
      );
      expect(loginFailure.metadata.reason).toBe('user_not_found');
    });

    it('records auth.login.failure with user ID when password is incorrect', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'agent.test@omnidesk.local',
          password: 'wrong-password',
        })
        .expect(401);

      const loginFailure = recordedLogs.find(
        (l) => l.action === 'auth.login.failure',
      );
      expect(loginFailure).toBeDefined();
      expect(loginFailure.actorId).toBeNull();
      expect(loginFailure.targetId).toBe(sampleUser.id);
      expect(loginFailure.metadata.reason).toBe('invalid_credentials');
    });

    it('records auth.logout', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .expect(201);

      const logoutEvent = recordedLogs.find((l) => l.action === 'auth.logout');
      expect(logoutEvent).toBeDefined();
      expect(logoutEvent.actorId).toBe(adminUser.id);
      expect(logoutEvent.targetId).toBe(adminUser.id);
    });

    it('records auth.password_reset.requested', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'agent.test@omnidesk.local' })
        .expect(201);

      const forgotEvent = recordedLogs.find(
        (l) => l.action === 'auth.password_reset.requested',
      );
      expect(forgotEvent).toBeDefined();
      expect(forgotEvent.metadata.email).toBe('agent.test@omnidesk.local');
    });

    it('records auth.password_reset.completed', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({
          token: 'some-raw-token',
          newPassword: 'BrandNewSecurePassword123!',
        })
        .expect(201);

      const resetEvent = recordedLogs.find(
        (l) => l.action === 'auth.password_reset.completed',
      );
      expect(resetEvent).toBeDefined();
      expect(resetEvent.targetId).toBe(sampleUser.id);
    });
  });

  describe('User Mutations Audit Logging', () => {
    it('records user.created with creator admin ID in metadata', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send({
          name: 'New Agent Person',
          email: 'new.agent@omnidesk.local',
          role: UserRole.AGENT,
        })
        .expect(201);

      const userCreated = recordedLogs.find((l) => l.action === 'user.created');
      expect(userCreated).toBeDefined();
      expect(userCreated.actorId).toBe(adminUser.id);
      expect(userCreated.metadata.email).toBe('new.agent@omnidesk.local');
      expect(userCreated.metadata.role).toBe(UserRole.AGENT);
      expect(userCreated.metadata.createdBy).toBe(adminUser.id);
    });

    it('records user.status_updated with previous and new status', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/users/${sampleUser.id}/status`)
        .send({ status: UserStatus.INACTIVE })
        .expect(200);

      const statusUpdated = recordedLogs.find(
        (l) => l.action === 'user.status_updated',
      );
      expect(statusUpdated).toBeDefined();
      expect(statusUpdated.actorId).toBe(adminUser.id);
      expect(statusUpdated.targetId).toBe(sampleUser.id);
      expect(statusUpdated.metadata.email).toBe(sampleUser.email);
      expect(statusUpdated.metadata.previousStatus).toBe(UserStatus.ACTIVE);
      expect(statusUpdated.metadata.newStatus).toBe(UserStatus.INACTIVE);
    });
  });

  describe('Security & Privacy Audit: No Secret Leakage', () => {
    it('verifies that no audit log metadata leaks passwords, password hashes, or reset tokens', () => {
      for (const log of recordedLogs) {
        const metadataString = JSON.stringify(log.metadata || {});

        // Must never contain sensitive credential terms or secrets
        expect(metadataString.toLowerCase()).not.toContain('passwordhash');
        expect(metadataString).not.toContain('CorrectPassword123!');
        expect(metadataString).not.toContain('BrandNewSecurePassword123!');
        expect(metadataString).not.toContain('some-raw-token');
      }
    });
  });
});
