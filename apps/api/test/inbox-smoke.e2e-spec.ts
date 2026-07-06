import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ChannelType, OutboundProvider, UserRole } from '@prisma/client';
import request from 'supertest';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { ConversationsController } from '../src/modules/conversations/conversations.controller';
import { ConversationsService } from '../src/modules/conversations/conversations.service';
import { OutboundController } from '../src/modules/outbound/outbound.controller';
import { OutboundService } from '../src/modules/outbound/outbound.service';
import { UsersService } from '../src/modules/users/users.service';

describe('login -> inbox -> reply smoke flow (e2e)', () => {
  let app: INestApplication;

  const authService = {
    login: jest.fn().mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: {
        id: 'agent-id',
        name: 'Agent',
        email: 'agent@omnidesk.local',
        role: UserRole.AGENT,
      },
    }),
  };
  const usersService = {
    findById: jest.fn(),
  };
  const conversationsService = {
    list: jest.fn().mockResolvedValue({
      items: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          subject: 'Need help',
          channelType: ChannelType.EMAIL,
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
    }),
  };
  const outboundService = {
    create: jest.fn().mockResolvedValue({
      outboundMessage: {
        id: 'outbound-1',
        conversationId: '11111111-1111-4111-8111-111111111111',
        provider: OutboundProvider.EMAIL,
        status: 'QUEUED',
      },
      jobId: 'job-1',
      queued: true,
    }),
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [
        AuthController,
        ConversationsController,
        OutboundController,
      ],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: UsersService, useValue: usersService },
        { provide: ConversationsService, useValue: conversationsService },
        { provide: OutboundService, useValue: outboundService },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use((req, _res, next) => {
      req.user = {
        id: 'agent-id',
        email: 'agent@omnidesk.local',
        role: UserRole.AGENT,
      };
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

  afterEach(async () => {
    jest.clearAllMocks();
    await app.close();
  });

  it('logs in, loads inbox conversations, and queues a reply', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'agent@omnidesk.local',
        password: 'password',
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.data.user.email).toBe('agent@omnidesk.local');
      });

    await request(app.getHttpServer())
      .get('/api/v1/conversations')
      .expect(200)
      .expect((response) => {
        expect(response.body.data.items).toHaveLength(1);
      });

    await request(app.getHttpServer())
      .post('/api/v1/outbound/messages')
      .send({
        conversationId: '11111111-1111-4111-8111-111111111111',
        channelType: ChannelType.EMAIL,
        provider: OutboundProvider.EMAIL,
        content: 'Thanks, we are checking this.',
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          jobId: 'job-1',
          queued: true,
        });
      });

    expect(outboundService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: '11111111-1111-4111-8111-111111111111',
        content: 'Thanks, we are checking this.',
      }),
      'agent-id',
    );
  });
});
