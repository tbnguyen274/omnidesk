import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { UsersService } from '../src/modules/users/users.service';

describe('Auth Rate Limiting & Throttling (e2e)', () => {
  let app: INestApplication;

  const mockAuthService = {
    login: jest.fn().mockRejectedValue(new Error('Invalid email or password')),
    forgotPassword: jest.fn().mockResolvedValue({ success: true }),
    resetPassword: jest.fn().mockResolvedValue({ success: true }),
  };

  const mockUsersService = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          {
            name: 'default',
            ttl: 60000,
            limit: 100,
          },
        ]),
      ],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: UsersService, useValue: mockUsersService },
        {
          provide: APP_GUARD,
          useClass: ThrottlerGuard,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
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

  it('enforces rate limit of 5 req/min on POST /api/v1/auth/login and blocks the 6th request with 429', async () => {
    // Send 5 requests (within limit)
    for (let i = 0; i < 5; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'user@example.com', password: 'wrongpassword' });
      // Should NOT be 429
      expect(res.status).not.toBe(429);
    }

    // 6th request must be throttled with HTTP 429
    const throttledRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'user@example.com', password: 'wrongpassword' });

    expect(throttledRes.status).toBe(429);
  });

  it('enforces rate limit of 3 req/min on POST /api/v1/auth/forgot-password and blocks the 4th request with 429', async () => {
    // Send 3 requests (within limit)
    for (let i = 0; i < 3; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: `user${i}@example.com` });
      expect(res.status).toBe(201);
    }

    // 4th request must be throttled with HTTP 429
    const throttledRes = await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'another@example.com' });

    expect(throttledRes.status).toBe(429);
  });
});
