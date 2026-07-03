import { Injectable, Logger } from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import { PrismaService } from '../database/prisma.service';
import { providerConfig } from '../config/provider.config';

@Injectable()
export class EmailActionsService {
  private readonly logger = new Logger(EmailActionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async markAsRead(channelAccountId: string, messageId: string) {
    return this.executeAction(
      channelAccountId,
      messageId,
      async (client, uid) => {
        await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
        this.logger.log(`Marked message ${messageId} as read (uid: ${uid})`);
      },
    );
  }

  async markAsUnread(channelAccountId: string, messageId: string) {
    return this.executeAction(
      channelAccountId,
      messageId,
      async (client, uid) => {
        await client.messageFlagsRemove(uid, ['\\Seen'], { uid: true });
        this.logger.log(`Marked message ${messageId} as unread (uid: ${uid})`);
      },
    );
  }

  async markAsStarred(channelAccountId: string, messageId: string) {
    return this.executeAction(
      channelAccountId,
      messageId,
      async (client, uid) => {
        await client.messageFlagsAdd(uid, ['\\Flagged'], { uid: true });
        this.logger.log(`Marked message ${messageId} as starred (uid: ${uid})`);
      },
    );
  }

  async unmarkStarred(channelAccountId: string, messageId: string) {
    return this.executeAction(
      channelAccountId,
      messageId,
      async (client, uid) => {
        await client.messageFlagsRemove(uid, ['\\Flagged'], { uid: true });
        this.logger.log(
          `Unmarked message ${messageId} as starred (uid: ${uid})`,
        );
      },
    );
  }

  async moveToArchive(channelAccountId: string, messageId: string) {
    return this.executeAction(
      channelAccountId,
      messageId,
      async (client, uid, channelAccount) => {
        let archiveFolder = channelAccount.configJson?.['archiveFolder'];

        if (!archiveFolder) {
          // Try to dynamically find the archive folder
          const mailboxes = await client.list();
          const found = mailboxes.find(
            (mb) => mb.flags.has('\\Archive') || mb.flags.has('\\All'),
          );
          archiveFolder = found?.path || 'Archive';
        }

        await client.messageMove(uid, archiveFolder, { uid: true });
        this.logger.log(
          `Moved message ${messageId} to ${archiveFolder} (uid: ${uid})`,
        );
      },
    );
  }

  private async executeAction(
    channelAccountId: string,
    messageId: string,
    action: (
      client: ImapFlow,
      uid: string,
      channelAccount: any,
    ) => Promise<void>,
  ) {
    const channelAccount = await this.prisma.channelAccount.findUnique({
      where: { id: channelAccountId },
    });

    if (!channelAccount) {
      throw new Error(`Email channel account ${channelAccountId} not found`);
    }

    const client = new ImapFlow({
      host: requireConfig(providerConfig.email.imap.host, 'EMAIL_IMAP_HOST'),
      port: providerConfig.email.imap.port,
      secure: providerConfig.email.imap.secure,
      auth: {
        user: requireConfig(providerConfig.email.imap.user, 'EMAIL_IMAP_USER'),
        pass: requireConfig(
          providerConfig.email.imap.password,
          'EMAIL_IMAP_PASSWORD',
        ),
      },
    });

    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      const formattedMessageId = messageId.startsWith('<')
        ? messageId
        : `<${messageId}>`;
      const searchResult = await client.search(
        { header: { 'Message-ID': formattedMessageId } },
        { uid: true },
      );
      const uids = typeof searchResult === 'boolean' ? [] : searchResult;

      if (!uids || uids.length === 0) {
        this.logger.warn(
          `Could not find IMAP message with Message-ID ${messageId}`,
        );
        return;
      }

      const uid = uids[0].toString();
      await action(client, uid, channelAccount);
    } catch (err) {
      this.logger.error(`Error executing IMAP action for ${messageId}`, err);
      throw err;
    } finally {
      lock.release();
      await client.logout();
    }
  }
}

function requireConfig(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}
