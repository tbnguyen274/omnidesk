import { Injectable, Logger } from '@nestjs/common';
import { type AutoCloseJobPayload } from '@omnidesk/shared';
import {
  ChannelType,
  ConversationStatus,
  MessageDirection,
} from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AutoCloseProcessor {
  private readonly logger = new Logger(AutoCloseProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  async process(job: Job<AutoCloseJobPayload>) {
    const now = new Date(job.data.requestedAt);
    // 3 days ago
    const thresholdDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    const resolvedConversations = await this.prisma.conversation.findMany({
      where: {
        status: ConversationStatus.RESOLVED,
        resolvedAt: {
          lt: thresholdDate,
        },
      },
      select: {
        id: true,
        channelType: true,
        channelAccountId: true,
      },
    });

    if (resolvedConversations.length === 0) {
      return;
    }

    let closedCount = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const conv of resolvedConversations) {
        // 1. CONDITIONAL UPDATE: Only update if status is STILL RESOLVED at commit time
        // Prevents race condition if customer reopened the conversation with an inbound message
        const result = await tx.conversation.updateMany({
          where: {
            id: conv.id,
            status: ConversationStatus.RESOLVED,
            resolvedAt: { lt: thresholdDate },
          },
          data: { status: ConversationStatus.CLOSED },
        });

        // 2. Only emit OutboxEvent when update was actually committed
        if (result.count > 0) {
          closedCount++;

          let externalMessageId: string | null = null;
          if (conv.channelType === ChannelType.EMAIL) {
            const latestMsg = await tx.message.findFirst({
              where: {
                conversationId: conv.id,
                direction: MessageDirection.INBOUND,
                externalMessageId: { not: null },
              },
              orderBy: { createdAt: 'desc' },
              select: { externalMessageId: true },
            });
            externalMessageId = latestMsg?.externalMessageId ?? null;
          }

          await tx.outboxEvent.create({
            data: {
              type: 'CONVERSATION_STATUS_CHANGED',
              aggregateId: conv.id,
              payload: {
                conversationId: conv.id,
                previousStatus: ConversationStatus.RESOLVED,
                newStatus: ConversationStatus.CLOSED,
                channelType: conv.channelType,
                channelAccountId: conv.channelAccountId,
                externalMessageId,
              },
            },
          });
        }
      }
    });

    this.logger.log(`Auto-closed ${closedCount} conversations/tickets`);
  }
}
