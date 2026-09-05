import {
  Controller,
  Get,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole, UserStatus } from '@prisma/client';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { appConfig } from '../src/config/app.config';
import { AllowAnyAuthenticated } from '../src/common/auth/allow-any-authenticated.decorator';
import { AuthTokenService } from '../src/common/auth/auth-token.service';
import { CurrentUser } from '../src/common/auth/current-user.decorator';
import type { CurrentUser as CurrentUserType } from '../src/common/auth/current-user.type';
import { Public } from '../src/common/auth/public.decorator';
import { Roles } from '../src/common/auth/roles.decorator';
import { RolesGuard } from '../src/common/auth/roles.guard';
import { RedisService } from '../src/common/redis/redis.service';
import { AuditLogService } from '../src/modules/audit-log/audit-log.service';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { UsersService } from '../src/modules/users/users.service';

@Controller('test-security')
class TestSecurityController {
  @Public()
  @Get('public-route')
  publicRoute() {
    return { status: 'public_ok' };
  }

  @AllowAnyAuthenticated()
  @Get('any-authenticated')
  anyAuthenticatedRoute(@CurrentUser() user: CurrentUserType) {
    return { status: 'authenticated_ok', user };
  }

  @Roles(UserRole.ADMIN)
  @Get('admin-only')
  adminOnlyRoute(@CurrentUser() user: CurrentUserType) {
    return { status: 'admin_ok', user };
  }

  // Intentionally missing any decorator: must be blocked by default Deny-All
  @Get('unannotated-route')
  unannotatedRoute() {
    return { status: 'should_never_reach' };
  }
}

describe('Session Security, RolesGuard Deny-All & Account Lockout (e2e)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let authTokenService: AuthTokenService;
  let jwtService: JwtService;

  // In-memory Redis simulation for realistic integration behavior
  const redisStore = new Map<string, { value: string; expiry?: number }>();
  const mockRedisClient = {
    get: jest.fn().mockImplementation(async (key: string) => {
      const entry = redisStore.get(key);
      if (!entry) return null;
      if (entry.expiry && Date.now() > entry.expiry) {
        redisStore.delete(key);
        return null;
      }
      return entry.value;
    }),
    set: jest
      .fn()
      .mockImplementation(
        async (
          key: string,
          val: string,
          _mode?: string,
          ttl?: number,
          flag?: string,
        ) => {
          const existing = redisStore.get(key);
          const isExpired = existing?.expiry && Date.now() > existing.expiry;
          if (flag === 'NX' && existing && !isExpired) {
            return null;
          }
          redisStore.set(key, {
            value: val,
            expiry: ttl ? Date.now() + ttl * 1000 : undefined,
          });
          return 'OK';
        },
      ),
    del: jest.fn().mockImplementation(async (key: string) => {
      const existed = redisStore.has(key);
      redisStore.delete(key);
      return existed ? 1 : 0;
    }),
    incr: jest.fn().mockImplementation(async (key: string) => {
      const entry = redisStore.get(key);
      const count = entry ? parseInt(entry.value, 10) + 1 : 1;
      redisStore.set(key, { value: count.toString(), expiry: entry?.expiry });
      return count;
    }),
    expire: jest.fn().mockImplementation(async (key: string, ttl: number) => {
      const entry = redisStore.get(key);
      if (entry) {
        entry.expiry = Date.now() + ttl * 1000;
      }
      return 1;
    }),
  };

  const mockRedisService = {
    getClient: jest.fn().mockReturnValue(mockRedisClient),
  };

  const mockAuditLogService = {
    log: jest.fn().mockResolvedValue({ id: 'mock-log-id' }),
  };

  const mockMailService = {
    sendMail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
  };

  const samplePassword = 'StrongPassword123!';
  let sampleHashedPassword = '';

  const sampleAgent = {
    id: '11111111-2222-3333-4444-555555555555',
    name: 'Agent Support',
    email: 'agent@omnidesk.local',
    role: UserRole.AGENT,
    status: UserStatus.ACTIVE,
  };

  const sampleAdmin = {
    id: '99999999-8888-7777-6666-555555555555',
    name: 'Super Admin',
    email: 'admin@omnidesk.local',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
  };

  const mockUsersService = {
    findByEmail: jest.fn().mockImplementation(async (email: string) => {
      if (email.toLowerCase() === sampleAgent.email) {
        return { ...sampleAgent, passwordHash: sampleHashedPassword };
      }
      if (email.toLowerCase() === sampleAdmin.email) {
        return { ...sampleAdmin, passwordHash: sampleHashedPassword };
      }
      return null;
    }),
    findById: jest.fn().mockImplementation(async (id: string) => {
      if (id === sampleAgent.id) return sampleAgent;
      if (id === sampleAdmin.id) return sampleAdmin;
      return null;
    }),
    setCurrentRefreshToken: jest.fn().mockResolvedValue(undefined),
    removeRefreshToken: jest.fn().mockResolvedValue(undefined),
  };

  let currentUserForContext: any = null;

  beforeAll(async () => {
    sampleHashedPassword = await hash(samplePassword, 10);

    jwtService = new JwtService({ secret: appConfig.jwtSecret });
    authService = new AuthService(
      mockUsersService as unknown as UsersService,
      jwtService,
      mockMailService as any,
      mockAuditLogService as unknown as AuditLogService,
      mockRedisService as unknown as RedisService,
    );
    authTokenService = new AuthTokenService(
      jwtService,
      mockUsersService as unknown as UsersService,
      mockRedisService as unknown as RedisService,
    );

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AuthController, TestSecurityController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: UsersService, useValue: mockUsersService },
        { provide: AuthTokenService, useValue: authTokenService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: AuditLogService, useValue: mockAuditLogService },
        {
          provide: APP_GUARD,
          useClass: RolesGuard,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use((req: any, _res: any, next: () => void) => {
      // Simulate authenticated user context attached by JwtAuthGuard
      if (currentUserForContext) {
        req.user = currentUserForContext;
      }
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
    currentUserForContext = null;
    redisStore.clear();
    jest.clearAllMocks();
  });

  describe('1. RolesGuard Default Deny-All & Decorator Enforcement', () => {
    it('allows access to @Public() routes without authentication', async () => {
      currentUserForContext = null;
      const res = await request(app.getHttpServer())
        .get('/api/v1/test-security/public-route')
        .expect(200);

      expect(res.body).toEqual({ status: 'public_ok' });
    });

    it('blocks unannotated routes with 403 Forbidden even when authenticated (Deny-All policy)', async () => {
      currentUserForContext = sampleAgent;
      await request(app.getHttpServer())
        .get('/api/v1/test-security/unannotated-route')
        .expect(403);
    });

    it('allows @AllowAnyAuthenticated() routes for any authenticated role (AGENT or ADMIN)', async () => {
      // AGENT user
      currentUserForContext = sampleAgent;
      const agentRes = await request(app.getHttpServer())
        .get('/api/v1/test-security/any-authenticated')
        .expect(200);
      expect(agentRes.body.status).toBe('authenticated_ok');

      // ADMIN user
      currentUserForContext = sampleAdmin;
      const adminRes = await request(app.getHttpServer())
        .get('/api/v1/test-security/any-authenticated')
        .expect(200);
      expect(adminRes.body.status).toBe('authenticated_ok');
    });

    it('enforces role restrictions: ADMIN only allows ADMIN and rejects AGENT with 403', async () => {
      // AGENT -> 403 Forbidden
      currentUserForContext = sampleAgent;
      await request(app.getHttpServer())
        .get('/api/v1/test-security/admin-only')
        .expect(403);

      // ADMIN -> 200 OK
      currentUserForContext = sampleAdmin;
      const res = await request(app.getHttpServer())
        .get('/api/v1/test-security/admin-only')
        .expect(200);
      expect(res.body.status).toBe('admin_ok');
    });

    it('allows /auth/me for authenticated user with @AllowAnyAuthenticated()', async () => {
      currentUserForContext = sampleAgent;
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(sampleAgent.id);
    });
  });

  describe('2. Token Revocation via jti & Redis Blacklist (L1)', () => {
    it('issues an access token with jti and allows immediate verification', async () => {
      const loginResult = await authService.login({
        email: sampleAgent.email,
        password: samplePassword,
      });

      expect(loginResult.accessToken).toBeDefined();

      // Decode and verify token
      const validatedUser = await authTokenService.validateToken(
        loginResult.accessToken,
      );
      expect(validatedUser.id).toBe(sampleAgent.id);
      expect(validatedUser.jti).toBeDefined();
    });

    it('blacklists jti on logout and immediately rejects subsequent token validation', async () => {
      const loginResult = await authService.login({
        email: sampleAgent.email,
        password: samplePassword,
      });

      const validatedUser = await authTokenService.validateToken(
        loginResult.accessToken,
      );
      const tokenJti = validatedUser.jti!;
      expect(tokenJti).toBeDefined();

      // Perform logout
      await authService.logout(sampleAgent.id, tokenJti);

      // Verify jti is blacklisted in Redis with 900s TTL
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `blacklist:jwt:${tokenJti}`,
        '1',
        'EX',
        900,
      );

      // Subsequent token validation must be rejected
      await expect(
        authTokenService.validateToken(loginResult.accessToken),
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        authTokenService.validateToken(loginResult.accessToken),
      ).rejects.toThrow('Token has been revoked');
    });
  });

  describe('3. Account Lockout on Repeated Failed Logins (L5)', () => {
    it('locks account after 5 consecutive failed login attempts and rejects subsequent attempts', async () => {
      const targetEmail = sampleAgent.email;

      // Attempts 1 to 4: Fail with standard 401 Invalid credentials
      for (let i = 1; i <= 4; i++) {
        await expect(
          authService.login({
            email: targetEmail,
            password: 'wrong-password',
          }),
        ).rejects.toThrow('Invalid email or password');
      }

      // 5th attempt: Reaches threshold and locks account
      await expect(
        authService.login({
          email: targetEmail,
          password: 'wrong-password',
        }),
      ).rejects.toThrow(
        'Account is temporarily locked due to excessive failed attempts. Please try again in 15 minutes.',
      );

      // Verify lock key is set in Redis with 900s TTL
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `auth:locked:${targetEmail.toLowerCase()}`,
        '1',
        'EX',
        900,
      );

      // 6th attempt (even with correct password): Immediately rejected due to active lock
      await expect(
        authService.login({
          email: targetEmail,
          password: samplePassword,
        }),
      ).rejects.toThrow(
        'Account is temporarily locked due to excessive failed attempts. Please try again in 15 minutes.',
      );
    });

    it('clears failed attempts counter and lock on successful login', async () => {
      // 2 failed attempts
      await expect(
        authService.login({
          email: sampleAgent.email,
          password: 'wrong-password',
        }),
      ).rejects.toThrow('Invalid email or password');

      await expect(
        authService.login({
          email: sampleAgent.email,
          password: 'wrong-password',
        }),
      ).rejects.toThrow('Invalid email or password');

      expect(redisStore.has(`auth:failed_attempts:${sampleAgent.email}`)).toBe(
        true,
      );

      // Successful login resets keys
      const loginResult = await authService.login({
        email: sampleAgent.email,
        password: samplePassword,
      });

      expect(loginResult.accessToken).toBeDefined();
      expect(redisStore.has(`auth:failed_attempts:${sampleAgent.email}`)).toBe(
        false,
      );
      expect(redisStore.has(`auth:locked:${sampleAgent.email}`)).toBe(false);
    });
  });
});
