import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnApplicationShutdown
{
  // QueueService drains active jobs during onModuleDestroy before DB disconnect.
  async onApplicationShutdown() {
    await this.$disconnect();
  }
}
