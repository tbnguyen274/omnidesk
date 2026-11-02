import { Injectable, Logger } from '@nestjs/common';
import { evaluateConversationChange } from '@omnidesk/domain';
import {
  observeDatabaseOperation,
  positiveInteger,
  type AutoCloseJobPayload,
} from '@omnidesk/shared';
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
  private readonly batchSize = positiveInteger(
    process.env.WORKER_MAINTENANCE_BATCH_SIZE,
    100,
    'WORKER_MAINTENANCE_BATCH_SIZE',
  );
  constructor(private readonly prisma: PrismaService) {}

  async process(job: Job<AutoCloseJobPayload>) {
    this.logger.debug(
      JSON.stringify({
        action: 'maintenance_start',
        operation: 'auto-close',
        jobId: job.id,
      }),
    );
    const threshold = new Date(Date.now() - 3 * 86400000);
    let after: string | undefined;
    let closed = 0;
    for (;;) {
      const candidates = await this.prisma.conversation.findMany({
        where: {
          status: ConversationStatus.RESOLVED,
          resolvedAt: { lt: threshold },
          ...(after ? { id: { gt: after } } : {}),
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: this.batchSize,
      });
      for (const candidate of candidates) {
        const didClose = await observeDatabaseOperation(
          'maintenance.auto_close',
          () =>
            this.prisma.$transaction(async (tx) => {
              const locked = await tx.$queryRaw<
                { id: string }[]
              >`SELECT "id" FROM "conversations" WHERE "id" = ${candidate.id}::uuid FOR UPDATE SKIP LOCKED`;
              if (!locked.length) return false;
              const conversation = await tx.conversation.findUniqueOrThrow({
                where: { id: candidate.id },
                include: { ticket: true },
              });
              const policy = evaluateConversationChange(
                conversation,
                { type: 'AUTO_CLOSE' },
                { now: new Date() },
              );
              // Recheck under lock: an inbound message may have reopened this candidate.
              if (policy.conversationPatch.status !== ConversationStatus.CLOSED)
                return false;
              const updated = await tx.conversation.update({
                where: { id: candidate.id },
                data: {
                  ...policy.conversationPatch,
                  version: { increment: 1 },
                },
              });
              if (conversation.ticket && Object.keys(policy.ticketPatch).length)
                await tx.ticket.update({
                  where: { id: conversation.ticket.id },
                  data: policy.ticketPatch,
                });
              let externalMessageId: string | null = null;
              if (conversation.channelType === ChannelType.EMAIL) {
                const message = await tx.message.findFirst({
                  where: {
                    conversationId: candidate.id,
                    direction: MessageDirection.INBOUND,
                    externalMessageId: { not: null },
                  },
                  orderBy: { createdAt: 'desc' },
                  select: { externalMessageId: true },
                });
                externalMessageId = message?.externalMessageId ?? null;
              }
              await tx.outboxEvent.create({
                data: {
                  type: 'CONVERSATION_STATUS_CHANGED',
                  aggregateId: candidate.id,
                  payload: {
                    conversationId: candidate.id,
                    conversationVersion: updated.version,
                    previousStatus: ConversationStatus.RESOLVED,
                    newStatus: ConversationStatus.CLOSED,
                    channelType: conversation.channelType,
                    channelAccountId: conversation.channelAccountId,
                    externalMessageId,
                  },
                },
              });
              return true;
            }),
          (record) => this.logger.log(JSON.stringify(record)),
        );
        if (didClose) closed++;
      }
      if (candidates.length < this.batchSize) break;
      after = candidates[candidates.length - 1].id;
    }
    this.logger.log(`Auto-closed ${closed} conversations/tickets`);
  }
}
