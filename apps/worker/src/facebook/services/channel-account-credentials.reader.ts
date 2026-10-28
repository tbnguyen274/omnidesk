import { Injectable } from '@nestjs/common';
import { decrypt } from '@omnidesk/shared';
import { PrismaService } from '../../database/prisma.service';

/** Read-only provider configuration access, never domain persistence. */
@Injectable()
export class ChannelAccountCredentialsReader {
  constructor(private readonly prisma: PrismaService) {}

  async accessToken(id: string): Promise<string | null> {
    const account = await this.prisma.channelAccount.findUnique({
      where: { id },
      select: { accessTokenEncrypted: true },
    });
    const token = account?.accessTokenEncrypted;
    if (!token) return null;
    return process.env.ENCRYPTION_KEY
      ? decrypt(token, process.env.ENCRYPTION_KEY)
      : token;
  }
}
