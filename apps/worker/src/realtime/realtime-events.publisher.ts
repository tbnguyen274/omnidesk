import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { RealtimeEvent, RealtimeRoom } from '@omnidesk/shared';
import Redis from 'ioredis';

const REALTIME_EVENTS_CHANNEL = 'omnidesk:realtime-events';

type RealtimeEventEnvelope = {
  event: RealtimeEvent;
  rooms: RealtimeRoom[];
};

@Injectable()
export class RealtimeEventsPublisher implements OnModuleInit, OnModuleDestroy {
  private client: Redis | null = null;

  async onModuleInit() {
    this.client = new Redis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
    });

    await this.client.ping();
  }

  async onModuleDestroy() {
    await this.client?.quit();
  }

  async publish(event: RealtimeEvent, rooms: RealtimeRoom[]) {
    if (rooms.length === 0) {
      return;
    }

    await this.getClient().publish(
      REALTIME_EVENTS_CHANNEL,
      JSON.stringify({
        event,
        rooms: [...new Set(rooms)], // deduplicate rooms
      } satisfies RealtimeEventEnvelope),
    );
  }

  agentRoom(userId: string) {
    return `agent:${userId}`;
  }

  teamInboxRoom(): RealtimeRoom {
    return 'team:inbox';
  }

  conversationRoom(conversationId: string): RealtimeRoom {
    return `conversation:${conversationId}`;
  }

  private getClient() {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    return this.client;
  }
}
