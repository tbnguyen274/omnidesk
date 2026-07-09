import { MessageDirection, OutboundProvider } from '@prisma/client';
import nodemailer from 'nodemailer';
import { providerConfig } from '../config/provider.config';
import { EmailOutboundService } from './email-outbound.service';

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: jest.fn(),
  },
}));

describe('EmailOutboundService', () => {
  const originalOutboundMode = providerConfig.email.outboundMode;
  const originalSmtpConfig = { ...providerConfig.email.smtp };

  afterEach(() => {
    jest.clearAllMocks();
    providerConfig.email.outboundMode = originalOutboundMode;
    Object.assign(providerConfig.email.smtp, originalSmtpConfig);
  });

  it('sends SMTP replies with email threading headers', async () => {
    providerConfig.email.outboundMode = 'live';
    Object.assign(providerConfig.email.smtp, {
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      user: 'support@example.com',
      password: 'app-password',
      fromAddress: 'support@example.com',
    });

    const sendMail = jest.fn().mockResolvedValue({
      messageId: '<smtp-reply@example.com>',
    });
    jest.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail,
    } as never);

    const prisma = {
      outboundMessage: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'outbound-1',
          provider: OutboundProvider.EMAIL,
          conversationId: 'conversation-1',
          recipientExternalId: 'customer@example.com',
          replyToMessageId: 'message-1@example.com',
          content: 'Thanks for contacting us.',
          conversation: {
            subject: 'Need help',
          },
        }),
      },
      message: {
        findFirst: jest.fn().mockResolvedValue({
          externalMessageId: 'message-1@example.com',
          rawPayload: {
            references: ['root@example.com'],
            inReplyTo: 'previous@example.com',
          },
        }),
      },
    };
    const service = new EmailOutboundService(prisma as never);

    await expect(service.sendOutboundMessage('outbound-1')).resolves.toEqual({
      externalMessageId: '<smtp-reply@example.com>',
      sentAt: expect.any(Date),
    });

    expect(prisma.message.findFirst).toHaveBeenCalledWith({
      where: {
        conversationId: 'conversation-1',
        direction: MessageDirection.INBOUND,
        OR: [
          { id: 'message-1@example.com' },
          { externalMessageId: 'message-1@example.com' },
        ],
      },
      select: {
        externalMessageId: true,
        rawPayload: true,
      },
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: 'support@example.com',
      to: 'customer@example.com',
      subject: 'Re: Need help',
      text: 'Thanks for contacting us.',
      inReplyTo: '<message-1@example.com>',
      references: [
        '<root@example.com>',
        '<previous@example.com>',
        '<message-1@example.com>',
      ],
    });
  });

  it('falls back to latest inbound message when reply target is not provided', async () => {
    providerConfig.email.outboundMode = 'live';
    Object.assign(providerConfig.email.smtp, {
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      user: 'support@example.com',
      password: 'app-password',
      fromAddress: 'support@example.com',
    });

    const sendMail = jest.fn().mockResolvedValue({
      messageId: '<smtp-reply@example.com>',
    });
    jest.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail,
    } as never);

    const prisma = {
      outboundMessage: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'outbound-1',
          provider: OutboundProvider.EMAIL,
          conversationId: 'conversation-1',
          recipientExternalId: 'customer@example.com',
          replyToMessageId: null,
          content: 'Reply content',
          conversation: {
            subject: 'Re: Need help',
          },
        }),
      },
      message: {
        findFirst: jest.fn().mockResolvedValue({
          externalMessageId: 'latest@example.com',
          rawPayload: null,
        }),
      },
    };
    const service = new EmailOutboundService(prisma as never);

    await service.sendOutboundMessage('outbound-1');

    expect(prisma.message.findFirst).toHaveBeenCalledWith({
      where: {
        conversationId: 'conversation-1',
        direction: MessageDirection.INBOUND,
        externalMessageId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        externalMessageId: true,
        rawPayload: true,
      },
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Re: Need help',
        inReplyTo: '<latest@example.com>',
        references: ['<latest@example.com>'],
      }),
    );
  });
});
