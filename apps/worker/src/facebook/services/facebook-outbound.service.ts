import { Injectable, Logger } from '@nestjs/common';
import { ChannelType, OutboundProvider } from '@prisma/client';
import { providerConfig } from '../../config/provider.config';
import { PrismaService } from '../../database/prisma.service';
import { FacebookOutboundRepository } from '../repositories/facebook-outbound.repository';

type SendOutboundResult = {
  externalMessageId: string;
  sentAt: Date;
};

@Injectable()
export class FacebookOutboundService {
  private readonly logger = new Logger(FacebookOutboundService.name);

  constructor(
    private readonly facebookOutboundRepository: FacebookOutboundRepository,
    private readonly prisma: PrismaService,
  ) {}

  async sendOutboundMessage(
    outboundMessageId: string,
  ): Promise<SendOutboundResult> {
    const outboundMessage = await this.prisma.outboundMessage.findUnique({
      where: { id: outboundMessageId },
      include: {
        conversation: true,
      },
    });

    if (
      !outboundMessage ||
      outboundMessage.provider !== OutboundProvider.FACEBOOK
    ) {
      throw new Error('Facebook outbound message not found');
    }

    if (providerConfig.facebook.providerMode !== 'live') {
      return {
        externalMessageId: `mock_fb_${outboundMessage.id}`,
        sentAt: new Date(),
      };
    }

    const pageAccessToken = providerConfig.facebook.pageAccessToken;
    if (!pageAccessToken) {
      throw new Error('FACEBOOK_PAGE_ACCESS_TOKEN is required for live outbound');
    }

    const { conversation } = outboundMessage;
    const graphApiVersion = providerConfig.facebook.graphApiVersion;

    if (conversation.channelType === ChannelType.FACEBOOK_COMMENT) {
      // conversation.externalConversationId = FB_COMMENT:pageId:postId:threadId
      const parts = conversation.externalConversationId?.split(':') || [];
      const threadId = parts[3];

      if (!threadId) {
        throw new Error('Invalid Facebook Comment conversation ID structure');
      }

      const targetCommentId = outboundMessage.recipientExternalId || threadId;

      const response = await fetch(
        `https://graph.facebook.com/${graphApiVersion}/${targetCommentId}/comments`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${pageAccessToken}`,
          },
          body: JSON.stringify({
            message: outboundMessage.content,
          }),
        },
      );

      const responseData = (await response.json()) as {
        id?: string;
        error?: { message: string };
      };

      if (!response.ok || responseData.error) {
        throw new Error(
          `Facebook Graph API Error: ${
            responseData.error?.message || response.statusText
          }`,
        );
      }

      return {
        externalMessageId: responseData.id || `fb_${outboundMessage.id}`,
        sentAt: new Date(),
      };
    }

    if (conversation.channelType === ChannelType.FACEBOOK_MESSAGE) {
      const recipientId = outboundMessage.recipientExternalId;
      if (!recipientId) {
        throw new Error('Facebook Message recipient ID is missing');
      }

      const response = await fetch(
        `https://graph.facebook.com/${graphApiVersion}/me/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${pageAccessToken}`,
          },
          body: JSON.stringify({
            recipient: { id: recipientId },
            message: { text: outboundMessage.content },
          }),
        },
      );

      const responseData = (await response.json()) as {
        message_id?: string;
        error?: { message: string };
      };

      if (!response.ok || responseData.error) {
        throw new Error(
          `Facebook Graph API Error: ${
            responseData.error?.message || response.statusText
          }`,
        );
      }

      return {
        externalMessageId:
          responseData.message_id || `fb_msg_${outboundMessage.id}`,
        sentAt: new Date(),
      };
    }

    throw new Error(
      `Unsupported Facebook channel type: ${conversation.channelType}`,
    );
  }

  async createTimelineMessage(outboundMessageId: string) {
    await this.facebookOutboundRepository.createTimelineMessage(
      outboundMessageId,
    );
  }
}
