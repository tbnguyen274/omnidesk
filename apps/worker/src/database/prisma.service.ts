import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  Optional,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { databaseRuntimeConfig } from '@omnidesk/shared';

@Injectable()
export class PrismaService
  extends PrismaClient<Prisma.PrismaClientOptions, 'query' | 'error'>
  implements OnApplicationShutdown
{
  constructor(@Optional() options: Prisma.PrismaClientOptions = {}) {
    const config = databaseRuntimeConfig(
      'worker',
      process.env,
      options.datasourceUrl ?? options.datasources?.db?.url,
    );
    super({
      ...options,
      datasources: undefined,
      datasourceUrl: config.url,
      transactionOptions: {
        ...config.transactionOptions,
        ...options.transactionOptions,
      },
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
      ],
    });
    const logger = new Logger(PrismaService.name);
    this.$on('query', (event) => {
      if (event.duration > 500)
        logger.warn(
          JSON.stringify({
            action: 'db_slow_query',
            service: 'worker',
            durationMs: event.duration,
          }),
        );
    });
    this.$on('error', () =>
      logger.error(
        JSON.stringify({ action: 'db_client_error', service: 'worker' }),
      ),
    );
  }

  // QueueService drains active jobs during onModuleDestroy before DB disconnect.
  async onApplicationShutdown() {
    await this.$disconnect();
  }
}
