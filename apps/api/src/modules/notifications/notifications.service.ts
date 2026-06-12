import { Inject, Injectable } from '@nestjs/common';
import type { RealtimeEvent, RealtimeRoom } from '@omnidesk/shared';
import {
  NOTIFICATIONS_PUBLISHER,
  type NotificationsPublisher,
} from './ports/notifications-publisher.port';

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(NOTIFICATIONS_PUBLISHER)
    private readonly publisher: NotificationsPublisher,
  ) {}

  publish(event: RealtimeEvent, rooms: RealtimeRoom[]) {
    if (rooms.length === 0) {
      return;
    }

    this.publisher.publish(event, { rooms: this.uniqueRooms(rooms) });
  }

  publishToAgent(userId: string, event: RealtimeEvent) {
    this.publish(event, [this.agentRoom(userId)]);
  }

  publishToConversation(conversationId: string, event: RealtimeEvent) {
    this.publish(event, [this.conversationRoom(conversationId)]);
  }

  publishToAgentAndConversation(
    userId: string,
    conversationId: string,
    event: RealtimeEvent,
  ) {
    this.publish(event, [
      this.agentRoom(userId),
      this.conversationRoom(conversationId),
    ]);
  }

  agentRoom(userId: string): RealtimeRoom {
    return `agent:${userId}`;
  }

  conversationRoom(conversationId: string): RealtimeRoom {
    return `conversation:${conversationId}`;
  }

  private uniqueRooms(rooms: RealtimeRoom[]) {
    return [...new Set(rooms)];
  }
}
