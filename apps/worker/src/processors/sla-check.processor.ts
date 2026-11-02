import { Injectable, Logger } from '@nestjs/common';
import { evaluateConversationChange } from '@omnidesk/domain';
import {
  observeDatabaseOperation,
  positiveInteger,
  REALTIME_EVENT_TYPES,
  type SlaCheckJobPayload,
} from '@omnidesk/shared';
import { Job } from 'bullmq';
import { PrismaService } from '../database/prisma.service';
import { RealtimeEventsPublisher } from '../realtime/realtime-events.publisher';
import { ConversationStatus } from '@prisma/client';

@Injectable()
export class SlaCheckProcessor {
  private readonly logger = new Logger(SlaCheckProcessor.name);
  private readonly batchSize = positiveInteger(
    process.env.WORKER_MAINTENANCE_BATCH_SIZE,
    100,
    'WORKER_MAINTENANCE_BATCH_SIZE',
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeEventsPublisher: RealtimeEventsPublisher,
  ) {}

  async process(job: Job<SlaCheckJobPayload>) {
    this.logger.debug(
      JSON.stringify({
        action: 'maintenance_start',
        operation: 'sla-check',
        jobId: job.id,
      }),
    );
    // Repeatable job data is a template. Its requestedAt is never a business clock.
    const scanAt = new Date();
    let after: string | undefined;
    for (;;) {
      const candidates = await this.prisma.conversation.findMany({
        where: {
          ...(after ? { id: { gt: after } } : {}),
          ticket: {
            is: {
              OR: [
                { isOverdue: true },
                {
                  slaDueAt: { lt: scanAt },
                  slaPausedAt: null,
                  conversation: {
                    status: {
                      in: [
                        ConversationStatus.NEW,
                        ConversationStatus.IN_PROGRESS,
                      ],
                    },
                  },
                },
              ],
            },
          },
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: this.batchSize,
      });
      for (const candidate of candidates) {
        const changed = await observeDatabaseOperation(
          'maintenance.sla',
          () =>
            this.prisma.$transaction(async (tx) => {
              const locked = await tx.$queryRaw<
                { id: string }[]
              >`SELECT "id" FROM "conversations" WHERE "id" = ${candidate.id}::uuid FOR UPDATE SKIP LOCKED`;
              if (!locked.length) return null;
              const conversation = await tx.conversation.findUniqueOrThrow({
                where: { id: candidate.id },
                include: { ticket: true },
              });
              const now = new Date();
              const policy = evaluateConversationChange(
                conversation,
                { type: 'SLA_CHECK' },
                { now },
              );
              if (!policy.changed || !conversation.ticket) return null;
              await tx.conversation.update({
                where: { id: candidate.id },
                data: { version: { increment: 1 } },
              });
              await tx.ticket.update({
                where: { id: conversation.ticket.id },
                data: policy.ticketPatch,
              });
              return {
                conversationId: candidate.id,
                ticketId: conversation.ticket.id,
                overdue: policy.ticketPatch.isOverdue === true,
                occurredAt: now.toISOString(),
              };
            }),
          (record) => this.logger.log(JSON.stringify(record)),
        );
        if (changed) {
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            const publication = this.realtimeEventsPublisher.publish(
              {
                type: changed.overdue
                  ? REALTIME_EVENT_TYPES.SLA_OVERDUE
                  : REALTIME_EVENT_TYPES.TICKET_UPDATED,
                ticketId: changed.ticketId,
                conversationId: changed.conversationId,
                occurredAt: changed.occurredAt,
              },
              [
                this.realtimeEventsPublisher.conversationRoom(
                  changed.conversationId,
                ),
                this.realtimeEventsPublisher.teamInboxRoom(),
              ],
            );
            await Promise.race([
              publication,
              new Promise<never>((_, reject) => {
                timer = setTimeout(
                  () => reject(new Error('SLA notification timeout')),
                  2000,
                );
              }),
            ]);
          } catch {
            // The committed state is authoritative; Redis Pub/Sub is best effort.
            this.logger.warn(
              JSON.stringify({
                action: 'realtime_publish_failed',
                operation: 'maintenance.sla',
                conversationId: changed.conversationId,
              }),
            );
          } finally {
            clearTimeout(timer);
          }
        }
      }
      if (candidates.length < this.batchSize) break;
      after = candidates[candidates.length - 1].id;
    }
  }
}
