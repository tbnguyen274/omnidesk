import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ChannelType,
  ConversationStatus,
  OutboundMessageStatus,
  OutboundProvider,
  UserRole,
} from '@prisma/client';
import { OutboundService } from './outbound.service';

describe('OutboundService', () => {
  const conversationId = '11111111-1111-4111-8111-111111111111';
  const agent = {
    id: 'agent-id',
    email: 'agent@example.com',
    name: 'Agent',
    role: UserRole.AGENT,
  };

  function createService() {
    const outboundRepository = {
      findConversationById: jest.fn(),
      findReplyTarget: jest.fn(),
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      createSendRequest: jest.fn().mockImplementation((input) => ({
        id: 'outbound-id',
        status: OutboundMessageStatus.PENDING,
        requestHash: null,
        ...input,
      })),
    };
    const outboxDispatcher = {
      trigger: jest.fn(),
    };
    const notifications = {
      publishToConversation: jest.fn(),
    };

    return {
      service: new OutboundService(
        outboundRepository as never,
        outboxDispatcher as never,
        notifications as never,
      ),
      outboundRepository,
      outboxDispatcher,
    };
  }

  it('derives the email provider and recipient from the conversation', async () => {
    const { service, outboundRepository, outboxDispatcher } = createService();
    outboundRepository.findConversationById.mockResolvedValue({
      id: conversationId,
      channelType: ChannelType.EMAIL,
      status: ConversationStatus.NEW,
      assignedAgentId: null,
      customer: {
        email: 'trusted@example.com',
        externalFacebookId: null,
      },
    });

    await expect(
      service.create({ conversationId, content: '  Trusted reply  ' }, agent),
    ).resolves.toMatchObject({
      queued: true,
      jobId: null,
      duplicated: false,
    });

    expect(outboundRepository.createSendRequest).toHaveBeenCalledWith(
      {
        conversationId,
        channelType: ChannelType.EMAIL,
        provider: OutboundProvider.EMAIL,
        recipientExternalId: 'trusted@example.com',
        replyToMessageId: undefined,
        content: 'Trusted reply',
      },
      [],
      'agent-id',
      undefined,
      expect.any(String),
    );
    expect(outboxDispatcher.trigger).toHaveBeenCalledTimes(1);
  });

  it('normalizes a verified Facebook comment reply target', async () => {
    const { service, outboundRepository } = createService();
    outboundRepository.findConversationById.mockResolvedValue({
      id: conversationId,
      channelType: ChannelType.FACEBOOK_COMMENT,
      status: ConversationStatus.IN_PROGRESS,
      assignedAgentId: 'agent-id',
      customer: { email: null, externalFacebookId: null },
    });
    outboundRepository.findReplyTarget.mockResolvedValue({
      id: 'message-id',
      externalMessageId: 'facebook-comment-id',
    });

    await service.create(
      {
        conversationId,
        content: 'Reply',
        replyToMessageId: 'message-id',
      },
      agent,
    );

    expect(outboundRepository.createSendRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: OutboundProvider.FACEBOOK,
        recipientExternalId: undefined,
        replyToMessageId: 'facebook-comment-id',
      }),
      [],
      'agent-id',
      undefined,
      expect.any(String),
    );
  });

  it('rejects a reply target outside the conversation', async () => {
    const { service, outboundRepository } = createService();
    outboundRepository.findConversationById.mockResolvedValue({
      id: conversationId,
      channelType: ChannelType.EMAIL,
      status: ConversationStatus.NEW,
      assignedAgentId: null,
      customer: { email: 'customer@example.com', externalFacebookId: null },
    });
    outboundRepository.findReplyTarget.mockResolvedValue(null);

    await expect(
      service.create(
        {
          conversationId,
          content: 'Reply',
          replyToMessageId: 'another-conversation-message',
        },
        agent,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(outboundRepository.createSendRequest).not.toHaveBeenCalled();
  });

  it('rejects outbound messages for closed conversations', async () => {
    const { service, outboundRepository } = createService();
    outboundRepository.findConversationById.mockResolvedValue({
      id: conversationId,
      channelType: ChannelType.EMAIL,
      status: ConversationStatus.CLOSED,
      assignedAgentId: null,
      customer: { email: 'customer@example.com', externalFacebookId: null },
    });

    await expect(
      service.create({ conversationId, content: 'Reply' }, agent),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(outboundRepository.createSendRequest).not.toHaveBeenCalled();
  });

  it('rejects an agent replying to another agent assignment', async () => {
    const { service, outboundRepository } = createService();
    outboundRepository.findConversationById.mockResolvedValue({
      id: conversationId,
      channelType: ChannelType.EMAIL,
      status: ConversationStatus.IN_PROGRESS,
      assignedAgentId: 'another-agent-id',
      customer: { email: 'customer@example.com', externalFacebookId: null },
    });

    await expect(
      service.create({ conversationId, content: 'Reply' }, agent),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(outboundRepository.createSendRequest).not.toHaveBeenCalled();
  });

  it('enforces the Facebook content limit', async () => {
    const { service, outboundRepository } = createService();
    outboundRepository.findConversationById.mockResolvedValue({
      id: conversationId,
      channelType: ChannelType.FACEBOOK_MESSAGE,
      status: ConversationStatus.IN_PROGRESS,
      assignedAgentId: 'agent-id',
      customer: { email: null, externalFacebookId: 'facebook-customer-id' },
    });

    await expect(
      service.create({ conversationId, content: 'x'.repeat(2_001) }, agent),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(outboundRepository.createSendRequest).not.toHaveBeenCalled();
  });

  it('returns the existing message for a repeated idempotency key', async () => {
    const { service, outboundRepository, outboxDispatcher } = createService();
    const dto = { conversationId, content: 'Same request' };
    const requestHash = (service as any).createRequestHash(dto);
    outboundRepository.findByIdempotencyKey.mockResolvedValue({
      id: 'existing-outbound',
      status: OutboundMessageStatus.PENDING,
      requestHash,
    });

    await expect(
      service.create(dto, agent, 'request-1'),
    ).resolves.toMatchObject({
      outboundMessage: { id: 'existing-outbound' },
      duplicated: true,
    });
    expect(outboundRepository.findConversationById).not.toHaveBeenCalled();
    expect(outboundRepository.createSendRequest).not.toHaveBeenCalled();
    expect(outboxDispatcher.trigger).not.toHaveBeenCalled();
  });

  it('rejects reuse of an idempotency key with a different payload', async () => {
    const { service, outboundRepository } = createService();
    outboundRepository.findByIdempotencyKey.mockResolvedValue({
      id: 'existing-outbound',
      status: OutboundMessageStatus.PENDING,
      requestHash: 'different-hash',
    });

    await expect(
      service.create(
        { conversationId, content: 'Different request' },
        agent,
        'request-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
