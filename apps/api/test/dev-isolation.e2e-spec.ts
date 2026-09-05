import cookieParser from 'cookie-parser';
import {
  Controller,
  Get,
  INestApplication,
  UseGuards,
  VersioningType,
} from '@nestjs/common';
import { AuthGuard, PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { AuthTokenService } from '../src/common/auth/auth-token.service';
import { CurrentUser } from '../src/common/auth/current-user.decorator';
import type { CurrentUser as CurrentUserType } from '../src/common/auth/current-user.type';
import { DevEmailController } from '../src/modules/dev/dev-email.controller';
import { DevFacebookController } from '../src/modules/dev/dev-facebook.controller';
import { EmailController } from '../src/modules/email/email.controller';
import { EmailService } from '../src/modules/email/email.service';
import { FacebookController } from '../src/modules/facebook/facebook.controller';
import { FacebookService } from '../src/modules/facebook/facebook.service';
import { FacebookSignatureService } from '../src/modules/facebook/services/facebook-signature.service';
import { JwtStrategy } from '../src/modules/auth/jwt.strategy';
import { JwtService } from '@nestjs/jwt';
import { appConfig } from '../src/config/app.config';

@Controller('protected')
class ProtectedTestController {
  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  getProfile(@CurrentUser() user: CurrentUserType) {
    return { success: true, user };
  }
}

describe('Stage 2 Security Hardening: Dev Isolation & Query Param Removal (e2e)', () => {
  describe('Dev Routes Isolation (M3)', () => {
    let prodApp: INestApplication;
    let devApp: INestApplication;

    const mockEmailService = {
      listSyncLogs: jest.fn().mockResolvedValue([]),
      createSync: jest.fn(),
      mockInbound: jest.fn().mockResolvedValue({ id: 'mock-email-id' }),
    };

    const mockFacebookService = {
      verifyWebhook: jest.fn().mockReturnValue('verified'),
      receiveWebhook: jest.fn(),
      mockMessage: jest.fn().mockResolvedValue({ id: 'mock-msg-id' }),
      mockComment: jest.fn().mockResolvedValue({ id: 'mock-cmt-id' }),
    };

    beforeAll(async () => {
      // 1. Simulating Production: Only core EmailController & FacebookController registered
      const prodModule: TestingModule = await Test.createTestingModule({
        controllers: [FacebookController, EmailController],
        providers: [
          { provide: FacebookService, useValue: mockFacebookService },
          {
            provide: FacebookSignatureService,
            useValue: { verifyRequest: jest.fn() },
          },
          { provide: EmailService, useValue: mockEmailService },
        ],
      }).compile();

      prodApp = prodModule.createNestApplication();
      prodApp.setGlobalPrefix('api');
      prodApp.enableVersioning({
        type: VersioningType.URI,
        defaultVersion: '1',
      });
      await prodApp.init();

      // 2. Simulating Non-Production: Dev controllers are also registered
      const devModule: TestingModule = await Test.createTestingModule({
        controllers: [
          FacebookController,
          EmailController,
          DevFacebookController,
          DevEmailController,
        ],
        providers: [
          { provide: FacebookService, useValue: mockFacebookService },
          {
            provide: FacebookSignatureService,
            useValue: { verifyRequest: jest.fn() },
          },
          { provide: EmailService, useValue: mockEmailService },
        ],
      }).compile();

      devApp = devModule.createNestApplication();
      devApp.setGlobalPrefix('api');
      devApp.enableVersioning({
        type: VersioningType.URI,
        defaultVersion: '1',
      });
      await devApp.init();
    });

    afterAll(async () => {
      await prodApp.close();
      await devApp.close();
    });

    it('in production mode, dev routes return 404 Not Found', async () => {
      await request(prodApp.getHttpServer())
        .post('/api/v1/dev/facebook/mock-message')
        .send({
          senderId: 'fb-user-1',
          recipientId: 'fb-page-1',
          text: 'test',
        })
        .expect(404);

      await request(prodApp.getHttpServer())
        .post('/api/v1/dev/email/mock-inbound')
        .send({
          from: 'test@example.com',
          to: 'support@omnidesk.local',
          subject: 'Test',
          body: 'Hello',
        })
        .expect(404);
    });

    it('in non-production mode, dev routes are accessible', async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      try {
        await request(devApp.getHttpServer())
          .post('/api/v1/dev/facebook/mock-message')
          .send({
            senderId: 'fb-user-1',
            recipientId: 'fb-page-1',
            text: 'test',
          })
          .expect(201);

        await request(devApp.getHttpServer())
          .post('/api/v1/dev/email/mock-inbound')
          .send({
            from: 'test@example.com',
            to: 'support@omnidesk.local',
            subject: 'Test',
            body: 'Hello',
          })
          .expect(201);
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });
  });

  describe('JWT Strategy Extraction Hardening (M2)', () => {
    let authApp: INestApplication;
    let jwtService: JwtService;
    let validToken: string;

    const mockAuthTokenService = {
      validatePayload: jest.fn().mockImplementation((payload) => {
        return Promise.resolve({
          id: payload.sub,
          email: payload.email,
          name: 'Security Tester',
          role: payload.role,
        });
      }),
    };

    beforeAll(async () => {
      jwtService = new JwtService({ secret: appConfig.jwtSecret });
      validToken = jwtService.sign({
        sub: 'test-user-id',
        email: 'test@omnidesk.local',
        role: UserRole.AGENT,
      });

      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
        controllers: [ProtectedTestController],
        providers: [
          JwtStrategy,
          { provide: AuthTokenService, useValue: mockAuthTokenService },
        ],
      }).compile();

      authApp = moduleRef.createNestApplication();
      authApp.use(cookieParser());
      authApp.setGlobalPrefix('api');
      authApp.enableVersioning({
        type: VersioningType.URI,
        defaultVersion: '1',
      });
      await authApp.init();
    });

    afterAll(async () => {
      await authApp.close();
    });

    it('REJECTS token passed in query parameter (?token=...) with 401 Unauthorized', async () => {
      await request(authApp.getHttpServer())
        .get('/api/v1/protected/profile')
        .query({ token: validToken })
        .expect(401);
    });

    it('ACCEPTS token passed in Authorization: Bearer <token>', async () => {
      const res = await request(authApp.getHttpServer())
        .get('/api/v1/protected/profile')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.user.id).toBe('test-user-id');
    });

    it('ACCEPTS token passed in Authentication cookie', async () => {
      const res = await request(authApp.getHttpServer())
        .get('/api/v1/protected/profile')
        .set('Cookie', `Authentication=${validToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.user.id).toBe('test-user-id');
    });
  });
});
