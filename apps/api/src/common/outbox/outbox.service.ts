import { Injectable } from '@nestjs/common';
import { OutboxEventStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export type OutboxEventType = 'INBOUND_EVENT_CREATED';

/**
 * OutboxService writes domain events to the outbox table within the same
 * database transaction as the domain data. The OutboxDispatcherService
 * picks them up asynchronously and enqueues them into BullMQ.
 *
 * This ensures events are never lost even if Redis is unavailable at the
 * time the webhook is received.
 */
@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates an outbox event within an existing transaction.
   * Should always be called inside a `prisma.$transaction()` block
   * alongside the domain data write.
   */
  createEvent(
    tx: Prisma.TransactionClient,
    type: OutboxEventType,
    aggregateId: string,
    payload: Record<string, unknown>,
  ) {
    return tx.outboxEvent.create({
      data: {
        type,
        aggregateId,
        payload: payload as Prisma.InputJsonValue,
        status: OutboxEventStatus.PENDING,
      },
    });
  }

  /**
   * Finds pending outbox events that have not yet been dispatched.
   * Used by the dispatcher to pick up events to enqueue.
   */
  findPending(limit = 100) {
    return this.prisma.outboxEvent.findMany({
      where: { status: OutboxEventStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  markPublished(id: string, jobId: string) {
    return this.prisma.outboxEvent.update({
      where: { id },
      data: {
        status: OutboxEventStatus.PUBLISHED,
        jobId,
        publishedAt: new Date(),
      },
    });
  }

  markFailed(id: string, errorMessage: string) {
    return this.prisma.outboxEvent.update({
      where: { id },
      data: {
        status: OutboxEventStatus.DEAD,
        errorMessage,
        failedAt: new Date(),
        attempts: { increment: 1 },
      },
    });
  }

  incrementAttempts(id: string, errorMessage: string) {
    return this.prisma.outboxEvent.update({
      where: { id },
      data: {
        attempts: { increment: 1 },
        errorMessage,
      },
    });
  }

  /**
   * Deletes PUBLISHED outbox events older than the retention window.
   * Should be called periodically to keep the table small.
   */
  cleanup(retentionDays = 7) {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    return this.prisma.outboxEvent.deleteMany({
      where: {
        status: OutboxEventStatus.PUBLISHED,
        publishedAt: { lt: cutoff },
      },
    });
  }
}
