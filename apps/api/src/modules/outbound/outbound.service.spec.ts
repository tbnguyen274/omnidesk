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
    role: UserRole.AGENT,
  };

  function createService() {
    const outboundRepository = {
      findConversationById: jest.fn(),
      findReplyTarget: jest.fn(),
      createOutboundMessage: jest.fn().mockImplementation((input) => ({
        id: 'outbound-id',
        status: OutboundMessageStatus.PENDING,
        ...input,
      })),
    };
    const queues = {
      add: jest.fn().mockResolvedValue({ id: 'job-id' }),
    };
    const notifications = {
      publishToConversation: jest.fn(),
    };

    return {
      service: new OutboundService(
        outboundRepository as never,
        queues as never,
        notifications as never,
      ),
      outboundRepository,
      queues,
    };
  }

  it('derives the email provider and recipient from the conversation', async () => {
    const { service, outboundRepository, queues } = createService();
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
    ).resolves.toMatchObject({ queued: true, jobId: 'job-id' });

    expect(outboundRepository.createOutboundMessage).toHaveBeenCalledWith(
      {
        conversationId,
        channelType: ChannelType.EMAIL,
        provider: OutboundProvider.EMAIL,
        recipientExternalId: 'trusted@example.com',
        replyToMessageId: undefined,
        content: 'Trusted reply',
      },
      'agent-id',
    );
    expect(queues.add).toHaveBeenCalledWith(
      expect.any(String),
      'send-outbound-message',
      expect.objectContaining({ provider: OutboundProvider.EMAIL }),
    );
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

    expect(outboundRepository.createOutboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: OutboundProvider.FACEBOOK,
        recipientExternalId: undefined,
        replyToMessageId: 'facebook-comment-id',
      }),
      'agent-id',
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
    expect(outboundRepository.createOutboundMessage).not.toHaveBeenCalled();
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
    expect(outboundRepository.createOutboundMessage).not.toHaveBeenCalled();
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
    expect(outboundRepository.createOutboundMessage).not.toHaveBeenCalled();
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
    expect(outboundRepository.createOutboundMessage).not.toHaveBeenCalled();
  });
});
