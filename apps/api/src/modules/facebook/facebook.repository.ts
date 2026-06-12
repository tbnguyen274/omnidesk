import { Injectable } from '@nestjs/common';
import { ChannelAccountType } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';

@Injectable()
export class FacebookRepository {
  constructor(private readonly prisma: PrismaService) {}

  findPageAccountByExternalId(pageId: string) {
    return this.prisma.channelAccount.findFirst({
      where: {
        type: ChannelAccountType.FACEBOOK,
        externalId: pageId,
      },
    });
  }
}
