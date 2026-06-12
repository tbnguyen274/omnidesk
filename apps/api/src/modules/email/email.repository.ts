import { Injectable } from '@nestjs/common';
import { ChannelAccountType, EmailSyncStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';

@Injectable()
export class EmailRepository {
  constructor(private readonly prisma: PrismaService) {}

  findChannelAccountById(id: string) {
    return this.prisma.channelAccount.findUnique({
      where: { id },
    });
  }

  findFirstEmailChannelAccount() {
    return this.prisma.channelAccount.findFirst({
      where: { type: ChannelAccountType.EMAIL },
      orderBy: { createdAt: 'asc' },
    });
  }

  createSyncLog(channelAccountId: string) {
    return this.prisma.emailSyncLog.create({
      data: {
        channelAccountId,
        status: EmailSyncStatus.PARTIAL,
      },
    });
  }

  listSyncLogs(params: {
    where: Prisma.EmailSyncLogWhereInput;
    skip: number;
    take: number;
  }) {
    return this.prisma.$transaction([
      this.prisma.emailSyncLog.findMany({
        where: params.where,
        skip: params.skip,
        take: params.take,
        orderBy: { syncStartedAt: 'desc' },
        include: {
          channelAccount: {
            select: {
              id: true,
              displayName: true,
              externalId: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.emailSyncLog.count({ where: params.where }),
    ]);
  }
}
