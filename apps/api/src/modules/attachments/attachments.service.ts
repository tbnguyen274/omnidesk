import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { PrismaService } from '../../common/database/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { providerConfig } from '../../config/provider.config';

export type AttachmentContentResult = {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
};

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  async uploadAttachment(file: Express.Multer.File) {
    const ALLOWED_MIME_TYPES = new Set([
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]);

    const IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
    const DOC_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

    if (!file || !file.mimetype) {
      throw new BadRequestException('No file uploaded');
    }

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `File type "${file.mimetype}" is not allowed. Supported: JPEG, PNG, GIF, WEBP, PDF, DOCX, XLSX`,
      );
    }

    const isImage = file.mimetype.startsWith('image/');
    const maxBytes = isImage ? IMAGE_MAX_BYTES : DOC_MAX_BYTES;

    if (file.size > maxBytes) {
      const limitMb = maxBytes / 1024 / 1024;
      throw new BadRequestException(
        `File size ${(file.size / 1024 / 1024).toFixed(1)} MB exceeds the ${limitMb} MB limit`,
      );
    }

    return this.storageService.upload(
      file.buffer,
      file.originalname,
      file.mimetype,
    );
  }

  async getAttachmentContent(
    attachmentId: string,
  ): Promise<AttachmentContentResult> {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: {
        message: {
          include: {
            conversation: {
              include: {
                channelAccount: true,
              },
            },
            inboundEvent: true,
          },
        },
      },
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    const cacheKey = `cache/inbound/${attachment.id}`;

    // 1. Check if file is in MinIO cache
    const inCache = await this.storageService.hasObject(cacheKey);
    if (inCache) {
      this.logger.log(
        `Cache HIT for attachment ${attachment.id} (${attachment.fileName})`,
      );
      const buffer = await this.storageService.getObject(cacheKey);
      return {
        buffer,
        mimeType: attachment.mimeType,
        fileName: attachment.fileName,
        sizeBytes: buffer.length,
      };
    }

    // 2. If it's already an uploaded/regular MinIO key
    if (!attachment.storageKey.startsWith('lazy:imap:')) {
      try {
        const buffer = await this.storageService.getObject(
          attachment.storageKey,
        );
        return {
          buffer,
          mimeType: attachment.mimeType,
          fileName: attachment.fileName,
          sizeBytes: buffer.length,
        };
      } catch (err) {
        this.logger.warn(
          `Failed to read direct storageKey ${attachment.storageKey}: ${String(err)}`,
        );
      }
    }

    // 3. Cache MISS on lazy IMAP attachment -> fetch on-demand from mail server
    this.logger.log(
      `Cache MISS for attachment ${attachment.id} (${attachment.fileName}) — fetching from IMAP`,
    );

    const buffer = await this.fetchAttachmentFromImap(
      attachment.storageKey,
      attachment.message?.externalMessageId,
      attachment.fileName,
    );

    // Save to MinIO cache for fast subsequent reads
    try {
      await this.storageService.putObject(
        cacheKey,
        buffer,
        attachment.mimeType,
      );
      this.logger.log(`Saved attachment ${attachment.id} to MinIO cache`);
    } catch (err) {
      this.logger.warn(`Failed to put attachment to cache: ${String(err)}`);
    }

    return {
      buffer,
      mimeType: attachment.mimeType,
      fileName: attachment.fileName,
      sizeBytes: buffer.length,
    };
  }

  private async fetchAttachmentFromImap(
    storageKey: string,
    fallbackMessageId: string | null | undefined,
    targetFileName: string,
  ): Promise<Buffer> {
    // storageKey format: lazy:imap:<channelAccountId>:<messageId>:<idx>:<encodedFileName>
    const parts = storageKey.split(':');
    const messageId = parts[3] || fallbackMessageId;
    const attachmentIdx = parseInt(parts[4] ?? '0', 10);

    if (!providerConfig.email.imap.host || !providerConfig.email.imap.user) {
      throw new NotFoundException('IMAP host/credentials not configured');
    }

    const client = new ImapFlow({
      host: providerConfig.email.imap.host,
      port: providerConfig.email.imap.port,
      secure: providerConfig.email.imap.secure,
      auth: {
        user: providerConfig.email.imap.user,
        pass: providerConfig.email.imap.password ?? '',
      },
    });

    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      let rawSource: Buffer | undefined;

      // Try searching for the email message by Message-ID header or recent uid
      if (messageId) {
        for await (const msg of client.fetch(
          { header: { 'message-id': messageId } },
          { source: true },
        )) {
          if (msg.source) {
            rawSource = msg.source;
            break;
          }
        }
      }

      // Fallback: search recent unread/messages if not found by header
      if (!rawSource) {
        for await (const msg of client.fetch('1:*', { source: true })) {
          if (msg.source) {
            const parsedQuick = await simpleParser(msg.source);
            const normId = (parsedQuick.messageId ?? '')
              .trim()
              .replace(/^<|>$/g, '');
            if (normId === messageId) {
              rawSource = msg.source;
              break;
            }
          }
        }
      }

      if (!rawSource) {
        throw new NotFoundException(
          `Email message ${messageId} not found in mailbox`,
        );
      }

      const parsed = await simpleParser(rawSource);
      if (!parsed.attachments || parsed.attachments.length === 0) {
        throw new NotFoundException('No attachments found in email');
      }

      // Match by filename or by index
      const matchedAtt =
        parsed.attachments.find(
          (a) =>
            a.filename === targetFileName ||
            a.filename?.toLowerCase() === targetFileName.toLowerCase(),
        ) ??
        parsed.attachments[attachmentIdx] ??
        parsed.attachments[0];

      if (!matchedAtt || !matchedAtt.content) {
        throw new NotFoundException(
          `Attachment ${targetFileName} content not found`,
        );
      }

      return matchedAtt.content;
    } finally {
      lock.release();
      await client.logout();
    }
  }
}
