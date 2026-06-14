import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import type { RealtimeEvent, RealtimeRoom } from '@omnidesk/shared';
import Redis from 'ioredis';
import { RedisService } from '../../common/redis/redis.service';
import { NotificationsService } from './notifications.service';

const REALTIME_EVENTS_CHANNEL = 'omnidesk:realtime-events';

type RealtimeEventEnvelope = {
  event: RealtimeEvent;
  rooms: RealtimeRoom[];
};

@Injectable()
export class NotificationsRedisBridgeService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationsRedisBridgeService.name);
  private subscriber: Redis | null = null;

  constructor(
    private readonly redisService: RedisService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async onModuleInit() {
    this.subscriber = this.redisService.getClient().duplicate();
    await this.subscriber.subscribe(REALTIME_EVENTS_CHANNEL);
    this.subscriber.on('message', (channel, message) => {
      this.handleMessage(message);
    });
  }

  async onModuleDestroy() {
    await this.subscriber?.quit();
  }

  private handleMessage(message: string) {
    try {
      const envelope: RealtimeEventEnvelope = JSON.parse(
        message,
      ) as RealtimeEventEnvelope;
      this.notificationsService.publish(envelope.event, envelope.rooms);
    } catch (error) {
      this.logger.warn(
        `Invalid realtime event message: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }
}
