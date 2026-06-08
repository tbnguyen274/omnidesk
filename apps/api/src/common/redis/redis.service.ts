import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
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

  getClient() {
    if (!this.client) {
      throw new Error('Redis client is not initialized');
    }

    return this.client;
  }

  async ping() {
    return this.getClient().ping();
  }
}
