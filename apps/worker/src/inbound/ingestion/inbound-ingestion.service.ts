import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type {
  ClaimedInboundEvent,
  IngestionResult,
  NormalizedInboundMessage,
} from '../inbound.types';
import { inboundSubject } from '../presentation';
import { InboundEventRepository } from './inbound-event.repository';
import { InboundIngestionRepository } from './inbound-ingestion.repository';
import {
  decideInboundConversation,
  initialTicketDeadline,
} from './inbound.policy';

@Injectable()
export class InboundIngestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: InboundIngestionRepository,
    private readonly events: InboundEventRepository,
  ) {}

  async ingest(
    claim: ClaimedInboundEvent,
    message: NormalizedInboundMessage,
  ): Promise<IngestionResult> {
    return this.prisma.$transaction(async (tx) => {
      await this.events.lockOwned(tx, claim);
      const prior = await this.repository.existingEventMessage(
        tx,
        claim.event.id,
      );
      const result = (
        conversationId: string,
        duplicated = false,
      ): IngestionResult => ({
        inboundEventId: claim.event.id,
        conversationId,
        conversationCreated: false,
        messageId: null,
        ticketId: null,
        duplicated,
      });
      if (prior) {
        await this.events.complete(tx, claim);
        return result(prior.conversationId, true);
      }
      const account = await this.repository.account(tx, message.account);
      const customer = await this.repository.customer(tx, message.customer);
      let conversation = await this.repository.conversation(
        tx,
        account.id,
        message,
      );
      // Detect redelivery before any conversation lifecycle/version/ticket changes.
      if (
        conversation &&
        (await this.repository.existingMessage(
          tx,
          conversation.id,
          message.externalMessageId,
        ))
      ) {
        await this.events.complete(tx, claim);
        return result(conversation.id, true);
      }
      const decision = decideInboundConversation(conversation?.status);
      const conversationCreated = decision.createNew;
      if (decision.createNew || !conversation) {
        conversation = await this.repository.createConversation(tx, {
          channelType: message.channelType,
          channelAccountId: account.id,
          customerId: customer.id,
          externalConversationId: message.externalConversationId,
          subject: message.presentation.subject,
          status: 'NEW',
          lastMessageAt: message.receivedAt,
        });
      } else {
        await this.repository.updateConversation(
          tx,
          conversation.id,
          conversation.version,
          {
            customerId: customer.id,
            subject: inboundSubject(conversation.subject, message.presentation),
            lastMessageAt: message.receivedAt,
            status: decision.reopen ? 'IN_PROGRESS' : undefined,
            resolvedAt: decision.reopen ? null : undefined,
            version: { increment: 1 },
          },
        );
      }
      const post = message.presentation.originalPost;
      if (conversationCreated && post) {
        await this.repository.createMessage(tx, {
          conversationId: conversation.id,
          direction: 'INBOUND',
          senderType: 'SYSTEM',
          content: post.content,
          contentType: 'SYSTEM',
          externalMessageId: `sys_post_link_${post.id}_${conversation.id}`,
          deliveryStatus: 'RECEIVED',
          createdAt: new Date(message.receivedAt.getTime() - 1000),
        });
      }
      const created = await this.repository.createMessage(tx, {
        conversationId: conversation.id,
        inboundEventId: claim.event.id,
        direction: message.direction,
        senderType: message.senderType,
        content: message.content,
        contentType: message.contentType,
        externalMessageId: message.externalMessageId,
        rawPayload: claim.event.rawPayload as Prisma.InputJsonValue,
        deliveryStatus: 'RECEIVED',
        createdAt: message.receivedAt,
      });
      await this.repository.attachments(tx, created.id, message.attachments);
      const deadline = initialTicketDeadline(
        !!conversation.ticket,
        conversation.priority,
        message.receivedAt,
      );
      const ticket = deadline
        ? await this.repository.createTicket(tx, conversation.id, deadline)
        : null;
      await this.events.complete(tx, claim);
      return {
        ...result(conversation.id),
        conversationCreated,
        messageId: created.id,
        ticketId: ticket?.id ?? null,
      };
    });
  }
}
