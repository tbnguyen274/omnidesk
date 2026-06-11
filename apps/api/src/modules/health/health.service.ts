import { Injectable } from '@nestjs/common';
import { HealthStatus } from '@omnidesk/shared';
import { PrismaService } from '../../common/database/prisma.service';
import { RedisService } from '../../common/redis/redis.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async check() {
    const checks = {
      database: await this.checkDatabase(),
      redis: await this.checkRedis(),
    };

    const status: HealthStatus = Object.values(checks).every(
      (check) => check.status === 'ok',
    )
      ? 'ok'
      : 'error';

    return {
      success: status === 'ok',
      data: {
        service: 'api',
        status,
        timestamp: new Date().toISOString(),
        checks,
      },
    };
  }

  private async checkDatabase() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' as const };
    } catch (error) {
      return {
        status: 'error' as const,
        message:
          error instanceof Error ? error.message : 'Database check failed',
      };
    }
  }

  private async checkRedis() {
    try {
      await this.redis.ping();
      return { status: 'ok' as const };
    } catch (error) {
      return {
        status: 'error' as const,
        message: error instanceof Error ? error.message : 'Redis check failed',
      };
    }
  }
}
