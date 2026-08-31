import {
  BadRequestException,
  ConflictException,
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ChannelType,
  ConversationStatus,
  Priority,
  TicketStatus,
  UserRole,
} from '@prisma/client';
import request from 'supertest';
import { ConversationsController } from '../src/modules/conversations/conversations.controller';
import { ConversationsService } from '../src/modules/conversations/conversations.service';
import { DashboardController } from '../src/modules/dashboard/dashboard.controller';
import { DashboardService } from '../src/modules/dashboard/dashboard.service';
import { DevEmailController } from '../src/modules/email/email.controller';
import { EmailService } from '../src/modules/email/email.service';
import { DevFacebookController } from '../src/modules/facebook/facebook.controller';
import { FacebookService } from '../src/modules/facebook/facebook.service';
import { TicketsController } from '../src/modules/tickets/tickets.controller';
import { TicketsService } from '../src/modules/tickets/tickets.service';

describe('API Contract & Regression Baseline Suite (e2e)', () => {
  let app: INestApplication;

  const mockConversationsService = {
    list: jest.fn(),
    findById: jest.fn(),
    getMessages: jest.fn(),
    updateStatus: jest.fn(),
    updatePriority: jest.fn(),
    updateReadStatus: jest.fn(),
    updateAssignment: jest.fn(),
    addTag: jest.fn(),
    removeTag: jest.fn(),
  };

  const mockTicketsService = {
    list: jest.fn(),
    findById: jest.fn(),
    updateStatus: jest.fn(),
    updateAssignment: jest.fn(),
  };

  const mockDashboardService = {
    getSummary: jest.fn(),
    getAgentPerformance: jest.fn(),
  };

  const mockEmailService = {
    mockInbound: jest.fn(),
  };

  const mockFacebookService = {
    mockMessage: jest.fn(),
    mockComment: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [
        ConversationsController,
        TicketsController,
        DashboardController,
        DevEmailController,
        DevFacebookController,
      ],
      providers: [
        { provide: ConversationsService, useValue: mockConversationsService },
        { provide: TicketsService, useValue: mockTicketsService },
        { provide: DashboardService, useValue: mockDashboardService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: FacebookService, useValue: mockFacebookService },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use((req: any, _res: any, next: () => void) => {
      req.user = {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'lead.agent@omnidesk.local',
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

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('PATCH /api/v1/conversations/:id/status (Contract & Concurrency)', () => {
    const convId = '22222222-2222-4222-8222-222222222222';

    it('accepts valid transitions (NEW -> IN_PROGRESS -> RESOLVED -> CLOSED)', async () => {
      mockConversationsService.updateStatus.mockResolvedValueOnce({
        id: convId,
        status: ConversationStatus.IN_PROGRESS,
        version: 2,
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/conversations/${convId}/status`)
        .send({
          status: ConversationStatus.IN_PROGRESS,
          version: 1,
        })
        .expect(200);

      expect(res.body).toEqual({
        success: true,
        data: {
          id: convId,
          status: ConversationStatus.IN_PROGRESS,
          version: 2,
        },
      });
      expect(mockConversationsService.updateStatus).toHaveBeenCalledWith(
        convId,
        ConversationStatus.IN_PROGRESS,
        1,
      );
    });

    it('rejects update with 409 Conflict when version is stale', async () => {
      mockConversationsService.updateStatus.mockRejectedValueOnce(
        new ConflictException(
          'Data was modified by another agent. Please refresh.',
        ),
      );

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/conversations/${convId}/status`)
        .send({
          status: ConversationStatus.RESOLVED,
          version: 1,
        })
        .expect(409);

      expect(res.body.message).toContain('Data was modified by another agent');
    });

    it('rejects invalid status with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/conversations/${convId}/status`)
        .send({
          status: 'NON_EXISTENT_STATUS',
          version: 1,
        })
        .expect(400);

      expect(mockConversationsService.updateStatus).not.toHaveBeenCalled();
    });

    it('rejects request missing version with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/conversations/${convId}/status`)
        .send({
          status: ConversationStatus.RESOLVED,
        })
        .expect(400);

      expect(mockConversationsService.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /api/v1/tickets/:id/status & assignment (Contract & Derived State)', () => {
    const ticketId = '33333333-3333-4333-8333-333333333333';

    it('successfully transitions ticket status', async () => {
      mockTicketsService.updateStatus.mockResolvedValueOnce({
        id: ticketId,
        status: TicketStatus.RESOLVED,
        priority: Priority.HIGH,
        resolvedAt: new Date().toISOString(),
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${ticketId}/status`)
        .send({
          status: TicketStatus.RESOLVED,
          version: 2,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockTicketsService.updateStatus).toHaveBeenCalledWith(
        ticketId,
        TicketStatus.RESOLVED,
        2,
      );
    });

    it('rejects status update with 400 when attempting to set ASSIGNED directly', async () => {
      mockTicketsService.updateStatus.mockRejectedValueOnce(
        new BadRequestException(
          'Use the assignment endpoint to move a ticket to ASSIGNED',
        ),
      );

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${ticketId}/status`)
        .send({
          status: TicketStatus.ASSIGNED,
          version: 1,
        })
        .expect(400);

      expect(res.body.message).toContain(
        'Use the assignment endpoint to move a ticket to ASSIGNED',
      );
    });

    it('allows assigning an agent via assignment endpoint', async () => {
      const agentId = '44444444-4444-4444-8444-444444444444';
      mockTicketsService.updateAssignment.mockResolvedValueOnce({
        id: ticketId,
        status: TicketStatus.ASSIGNED,
        assignedAgent: {
          id: agentId,
          name: 'Support Agent',
        },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${ticketId}/assignment`)
        .send({
          assignedAgentId: agentId,
          version: 1,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockTicketsService.updateAssignment).toHaveBeenCalledWith(
        ticketId,
        agentId,
        1,
      );
    });
  });

  describe('GET /api/v1/dashboard/summary (Contract Shape)', () => {
    it('returns summary matching the expected contract structure', async () => {
      const expectedSummary = {
        total: 100,
        new: 15,
        inProgress: 35,
        resolved: 45,
        overdue: 5,
        byChannel: {
          [ChannelType.EMAIL]: 70,
          [ChannelType.FACEBOOK_MESSAGE]: 20,
          [ChannelType.FACEBOOK_COMMENT]: 10,
        },
      };
      mockDashboardService.getSummary.mockResolvedValueOnce(expectedSummary);

      const res = await request(app.getHttpServer())
        .get('/api/v1/dashboard/summary')
        .expect(200);

      expect(res.body).toEqual({
        data: expectedSummary,
      });
      expect(mockDashboardService.getSummary).toHaveBeenCalledTimes(1);
    });
  });

  describe('Dev & Mock Endpoints Security Protection', () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('rejects POST /api/v1/dev/email/mock-inbound with 403 Forbidden in production', async () => {
      process.env.NODE_ENV = 'production';

      const res = await request(app.getHttpServer())
        .post('/api/v1/dev/email/mock-inbound')
        .send({
          mailbox: 'support@omnidesk.local',
          messageId: '<msg-prod@mail.local>',
          fromEmail: 'customer@example.com',
          subject: 'Test Subject',
          text: 'Hello from customer',
        })
        .expect(403);

      expect(res.body.message).toBe('Development endpoints are disabled');
      expect(mockEmailService.mockInbound).not.toHaveBeenCalled();
    });

    it('allows POST /api/v1/dev/email/mock-inbound in non-production mode', async () => {
      process.env.NODE_ENV = 'test';
      mockEmailService.mockInbound.mockResolvedValueOnce({
        eventId: 'inbound-event-1',
        accepted: true,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/dev/email/mock-inbound')
        .send({
          mailbox: 'support@omnidesk.local',
          messageId: '<msg-test@mail.local>',
          fromEmail: 'customer@example.com',
          subject: 'Test Subject',
          text: 'Hello from customer',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(mockEmailService.mockInbound).toHaveBeenCalled();
    });

    it('rejects POST /api/v1/dev/facebook/mock-message with 403 Forbidden in production', async () => {
      process.env.NODE_ENV = 'production';

      const res = await request(app.getHttpServer())
        .post('/api/v1/dev/facebook/mock-message')
        .send({
          pageId: 'fb-page-1',
          senderId: 'fb-sender-1',
          messageId: 'mid-1',
          text: 'Hello Facebook message',
        })
        .expect(403);

      expect(res.body.message).toBe('Development endpoints are disabled');
      expect(mockFacebookService.mockMessage).not.toHaveBeenCalled();
    });

    it('allows POST /api/v1/dev/facebook/mock-message in non-production mode', async () => {
      process.env.NODE_ENV = 'test';
      mockFacebookService.mockMessage.mockResolvedValueOnce({
        eventId: 'fb-event-1',
        accepted: true,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/dev/facebook/mock-message')
        .send({
          pageId: 'fb-page-1',
          senderId: 'fb-sender-1',
          messageId: 'mid-1',
          text: 'Hello Facebook message',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(mockFacebookService.mockMessage).toHaveBeenCalled();
    });

    it('rejects POST /api/v1/dev/facebook/mock-comment with 403 Forbidden in production', async () => {
      process.env.NODE_ENV = 'production';

      const res = await request(app.getHttpServer())
        .post('/api/v1/dev/facebook/mock-comment')
        .send({
          pageId: 'fb-page-1',
          postId: 'post-1',
          commentId: 'comment-1',
          commenterId: 'commenter-1',
          text: 'Nice post!',
        })
        .expect(403);

      expect(res.body.message).toBe('Development endpoints are disabled');
      expect(mockFacebookService.mockComment).not.toHaveBeenCalled();
    });
  });
});
