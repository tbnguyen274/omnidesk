import { Injectable } from '@nestjs/common';
import { decrypt } from '@omnidesk/shared';
import { PrismaService } from '../../database/prisma.service';

/** Read-only provider context access, never domain persistence. */
@Injectable()
export class ChannelAccountCredentialsReader {
  constructor(private readonly prisma: PrismaService) {}

  async customerProfile(externalFacebookId: string) {
    return this.prisma.customer.findUnique({
      where: { externalFacebookId },
      select: { name: true, avatarUrl: true },
    });
  }

  async accessToken(id?: string, pageId?: string): Promise<string | null> {
    if (!id && !pageId) return null;
    const account = await this.prisma.channelAccount.findUnique({
      where: pageId
        ? { type_externalId: { type: 'FACEBOOK', externalId: pageId } }
        : { id: id! },
      select: { accessTokenEncrypted: true },
    });
    const token = account?.accessTokenEncrypted;
    if (!token) return null;
    return process.env.ENCRYPTION_KEY
      ? decrypt(token, process.env.ENCRYPTION_KEY)
      : token;
  }
}
