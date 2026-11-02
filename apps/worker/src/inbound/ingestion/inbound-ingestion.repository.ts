import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import type { NormalizedInboundMessage } from '../inbound.types';

@Injectable()
export class InboundIngestionRepository {
  async account(
    tx: Prisma.TransactionClient,
    account: NormalizedInboundMessage['account'],
  ) {
    if (account.id) {
      const existing = await tx.channelAccount.findUnique({
        where: { id: account.id },
      });
      if (existing) return existing;
    }
    // Prisma upsert with an empty update can become SELECT + INSERT. Use a
    // database-native conflict-safe insert when two first events arrive together.
    await tx.channelAccount.createMany({
      skipDuplicates: true,
      data: {
        type: account.type,
        externalId: account.externalId,
        displayName: account.displayName,
        configJson: account.defaultConfig,
      },
    });
    return tx.channelAccount.findUniqueOrThrow({
      where: {
        type_externalId: { type: account.type, externalId: account.externalId },
      },
    });
  }

  async customer(
    tx: Prisma.TransactionClient,
    customer: NormalizedInboundMessage['customer'],
  ) {
    const { identity, name, avatarUrl } = customer;
    const where =
      identity.kind === 'email'
        ? { email: identity.value }
        : { externalFacebookId: identity.value };
    const update: Prisma.CustomerUpdateInput = {};
    if (name && (identity.kind === 'email' || name !== 'Unknown Customer'))
      update.name = name;
    if (identity.kind === 'facebook' && avatarUrl) update.avatarUrl = avatarUrl;
    await tx.customer.createMany({
      data: { ...where, name, avatarUrl },
      skipDuplicates: true,
    });
    const result = await tx.customer.findUniqueOrThrow({ where });
    await tx.$executeRaw`SELECT 1 FROM "customers" WHERE "id" = ${result.id}::uuid FOR UPDATE`;
    return Object.keys(update).length
      ? tx.customer.update({ where: { id: result.id }, data: update })
      : result;
  }

  async conversation(
    tx: Prisma.TransactionClient,
    accountId: string,
    message: NormalizedInboundMessage,
  ) {
    const candidate = await tx.conversation.findFirst({
      where: {
        channelAccountId: accountId,
        channelType: message.channelType,
        externalConversationId: message.externalConversationId,
      },
      orderBy: { createdAt: 'desc' },
      include: { ticket: true },
    });
    if (!candidate) return null;
    await tx.$executeRaw`SELECT 1 FROM "conversations" WHERE "id" = ${candidate.id}::uuid FOR UPDATE`;
    // READ COMMITTED: refresh the snapshot after acquiring the aggregate lock.
    return tx.conversation.findUniqueOrThrow({
      where: { id: candidate.id },
      include: { ticket: true },
    });
  }

  existingEventMessage(tx: Prisma.TransactionClient, eventId: string) {
    return tx.message.findFirst({
      where: { inboundEventId: eventId },
      select: { conversationId: true },
    });
  }

  existingMessage(
    tx: Prisma.TransactionClient,
    conversationId: string,
    externalMessageId: string,
  ) {
    return tx.message.findUnique({
      where: {
        conversationId_externalMessageId: { conversationId, externalMessageId },
      },
    });
  }

  createConversation(
    tx: Prisma.TransactionClient,
    data: Prisma.ConversationUncheckedCreateInput,
  ) {
    return tx.conversation.create({ data, include: { ticket: true } });
  }

  async updateConversation(
    tx: Prisma.TransactionClient,
    id: string,
    version: number,
    data: Prisma.ConversationUncheckedUpdateManyInput,
  ) {
    const result = await tx.conversation.updateMany({
      where: { id, version },
      data,
    });
    if (!result.count)
      throw new Error(
        'OCC Conflict: Conversation was updated by another process. Worker will retry.',
      );
  }

  createMessage(
    tx: Prisma.TransactionClient,
    data: Prisma.MessageUncheckedCreateInput,
  ) {
    return tx.message.create({ data });
  }

  async attachments(
    tx: Prisma.TransactionClient,
    messageId: string,
    attachments: NormalizedInboundMessage['attachments'],
  ) {
    if (!attachments.length) return;
    await tx.attachment.createMany({
      data: attachments.map((att) => {
        const id = randomUUID();
        return {
          id,
          messageId,
          storageKey: att.key,
          url: `/api/v1/attachments/${id}/content`,
          fileName: att.fileName,
          mimeType: att.mimeType,
          sizeBytes: att.sizeBytes,
        };
      }),
    });
  }
  createTicket(
    tx: Prisma.TransactionClient,
    conversationId: string,
    slaDueAt: Date,
    isOverdue: boolean,
  ) {
    return tx.ticket.create({ data: { conversationId, slaDueAt, isOverdue } });
  }
}
