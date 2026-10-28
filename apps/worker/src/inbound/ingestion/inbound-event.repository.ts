import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { InboundLeaseLostError } from '../inbound.types';
import type { ClaimedInboundEvent } from '../inbound.types';

export const PROCESSING_LEASE_MS = 10 * 60 * 1000;

/** Sole owner of processing-state writes in the Worker inbound pipeline. */
@Injectable()
export class InboundEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async claim(id: string): Promise<ClaimedInboundEvent | null> {
    const leaseStartedAt = new Date();
    const acquired = await this.prisma.inboundEvent.updateMany({
      where: {
        id,
        OR: [
          { normalizedStatus: { in: ['PENDING', 'FAILED'] } },
          {
            normalizedStatus: 'PROCESSING',
            processingStartedAt: {
              lt: new Date(leaseStartedAt.getTime() - PROCESSING_LEASE_MS),
            },
          },
        ],
      },
      data: {
        normalizedStatus: 'PROCESSING',
        processingStartedAt: leaseStartedAt,
      },
    });
    if (!acquired.count) return null;
    const event = await this.prisma.inboundEvent.findUnique({ where: { id } });
    return event ? { event, leaseStartedAt } : null;
  }

  async lockOwned(tx: Prisma.TransactionClient, claim: ClaimedInboundEvent) {
    await tx.$executeRaw`SELECT 1 FROM "inbound_events" WHERE "id" = ${claim.event.id}::uuid FOR UPDATE`;
    const event = await tx.inboundEvent.findFirst({ where: this.owned(claim) });
    if (!event) throw new InboundLeaseLostError(claim.event.id);
  }

  async complete(tx: Prisma.TransactionClient, claim: ClaimedInboundEvent) {
    const result = await tx.inboundEvent.updateMany({
      where: this.owned(claim),
      data: {
        normalizedStatus: 'PROCESSED',
        processedAt: new Date(),
        processingStartedAt: null,
        errorMessage: null,
      },
    });
    if (!result.count) throw new InboundLeaseLostError(claim.event.id);
  }

  async completeNoop(claim: ClaimedInboundEvent) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockOwned(tx, claim);
      await this.complete(tx, claim);
    });
  }

  async fail(claim: ClaimedInboundEvent, error: unknown) {
    return this.prisma.inboundEvent.updateMany({
      where: this.owned(claim),
      data: {
        normalizedStatus: 'FAILED',
        processingStartedAt: null,
        errorMessage:
          error instanceof Error ? error.message : 'Inbound processing failed',
      },
    });
  }

  private owned(claim: ClaimedInboundEvent): Prisma.InboundEventWhereInput {
    return {
      id: claim.event.id,
      normalizedStatus: 'PROCESSING',
      processingStartedAt: claim.leaseStartedAt,
    };
  }
}
