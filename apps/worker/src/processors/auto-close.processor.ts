import { Injectable, Logger } from '@nestjs/common';
import { type AutoCloseJobPayload } from '@omnidesk/shared';
import { ConversationStatus, TicketStatus } from '@prisma/client';
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
      },
    });

    if (resolvedConversations.length === 0) {
      return;
    }

    const conversationIds = resolvedConversations.map((c) => c.id);

    await this.prisma.$transaction(async (tx) => {
      await tx.conversation.updateMany({
        where: { id: { in: conversationIds } },
        data: { status: ConversationStatus.CLOSED },
      });

      await tx.ticket.updateMany({
        where: { conversationId: { in: conversationIds } },
        data: { status: TicketStatus.CLOSED, closedAt: now },
      });
    });

    this.logger.log(`Auto-closed ${conversationIds.length} tickets`);
  }
}
