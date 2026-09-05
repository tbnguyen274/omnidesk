import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { AuthTokenService } from '../../common/auth/auth-token.service';
import { appConfig } from '../../config/app.config';
import type {
  NotificationPublishTarget,
  NotificationsPublisher,
} from './ports/notifications-publisher.port';
import type { RealtimeEvent, RealtimeRoom } from '@omnidesk/shared';
import type { Server, Socket } from 'socket.io';

type AuthenticatedSocketData = {
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
};

type AuthenticatedSocketHandshake = Omit<Socket['handshake'], 'auth'> & {
  auth?: {
    token?: unknown;
  };
};

type AuthenticatedSocket = Omit<Socket, 'data' | 'handshake'> & {
  data: AuthenticatedSocketData;
  handshake: AuthenticatedSocketHandshake;
};

type ConversationRoomPayload = {
  conversationId?: string;
};

@WebSocketGateway({
  namespace: appConfig.realtimeNamespace,
  cors: {
    origin: appConfig.webOrigin,
    credentials: true,
  },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, NotificationsPublisher
{
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  private readonly server!: Server;

  constructor(private readonly authTokenService: AuthTokenService) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const user = await this.authenticate(client);

      client.data.user = user;
      await client.join(this.agentRoom(user.id));
      await client.join(this.teamInboxRoom());

      this.logger.debug(`Socket connected: ${client.id}`);
    } catch {
      client.emit('realtime.error', { message: 'Unauthorized' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.debug(`Socket disconnected: ${client.id}`);
  }

  publish(event: RealtimeEvent, target: NotificationPublishTarget) {
    if (target.rooms.length === 0) {
      return;
    }

    this.server.to(target.rooms).emit('realtime.event', event);
  }

  @SubscribeMessage('conversation.join')
  async handleConversationJoin(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ConversationRoomPayload,
  ) {
    await this.ensureAuthenticated(client);

    const conversationId = this.requireConversationId(payload);
    const room = this.conversationRoom(conversationId);

    await client.join(room);

    return {
      event: 'conversation.joined',
      data: { room },
    };
  }

  @SubscribeMessage('conversation.leave')
  async handleConversationLeave(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ConversationRoomPayload,
  ) {
    await this.ensureAuthenticated(client);

    const conversationId = this.requireConversationId(payload);
    const room = this.conversationRoom(conversationId);

    await client.leave(room);

    return {
      event: 'conversation.left',
      data: { room },
    };
  }

  @SubscribeMessage('agent_typing')
  async handleAgentTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { conversationId: string; isTyping: boolean },
  ) {
    await this.ensureAuthenticated(client);

    const conversationId = this.requireConversationId(payload);
    const room = this.conversationRoom(conversationId);

    // Broadcast to everyone else in the room
    client.broadcast.to(room).emit('realtime.event', {
      type: 'agent.typing',
      conversationId,
      agentName:
        client.data.user?.name || client.data.user?.email || 'An agent',
      isTyping: payload.isTyping,
    });
  }

  private async authenticate(client: AuthenticatedSocket) {
    const token = this.extractToken(client);

    if (!token) {
      throw new Error('Missing token');
    }

    return this.authTokenService.validateToken(token);
  }

  private extractToken(client: AuthenticatedSocket): string | null {
    // 1. Handshake auth object (Socket.IO client auth option)
    const authToken = client.handshake?.auth?.token;
    if (typeof authToken === 'string' && authToken.trim().length > 0) {
      return authToken.trim();
    }

    // 2. Authorization header (Strict RFC 6750 Bearer token)
    const authHeader = client.handshake?.headers?.authorization;
    if (typeof authHeader === 'string' && authHeader.trim().length > 0) {
      if (authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7).trim();
      }
      return null;
    }

    // 3. Cookie (Authentication cookie)
    const rawCookie = client.handshake?.headers?.cookie;
    if (rawCookie) {
      const match = rawCookie.match(/(?:^|;\s*)Authentication=([^;]*)/);
      if (match) {
        return decodeURIComponent(match[1]);
      }
    }

    return null;
  }

  private async ensureAuthenticated(client: AuthenticatedSocket) {
    if (client.data.user) {
      return client.data.user;
    }

    const user = await this.authenticate(client);
    client.data.user = user;
    await client.join(this.agentRoom(user.id));
    await client.join(this.teamInboxRoom());

    return user;
  }

  private requireConversationId(payload: ConversationRoomPayload) {
    if (!payload.conversationId || payload.conversationId.trim().length === 0) {
      throw new Error('conversationId is required');
    }

    return payload.conversationId;
  }

  private agentRoom(userId: string): RealtimeRoom {
    return `agent:${userId}`;
  }

  private teamInboxRoom(): RealtimeRoom {
    return 'team:inbox';
  }

  private conversationRoom(conversationId: string): RealtimeRoom {
    return `conversation:${conversationId}`;
  }
}
