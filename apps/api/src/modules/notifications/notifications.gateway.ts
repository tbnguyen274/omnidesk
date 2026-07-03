import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { JwtPayload } from '../../common/auth/current-user.type';
import { appConfig } from '../../config/app.config';
import { UsersService } from '../users/users.service';
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

  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const user = await this.authenticate(client);

      client.data.user = user;
      await client.join(this.agentRoom(user.id));

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
    for (const room of target.rooms) {
      this.server.to(room).emit('realtime.event', event);
    }
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
      agentName: client.data.user?.name || client.data.user?.email || 'An agent',
      isTyping: payload.isTyping,
    });
  }

  private async authenticate(client: AuthenticatedSocket) {
    const token = this.extractToken(client);

    if (!token) {
      throw new Error('Missing token');
    }

    const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
      secret: appConfig.jwtSecret,
    });
    const user = await this.usersService.findById(payload.sub);

    if (!user || user.status !== 'ACTIVE') {
      throw new Error('Invalid token');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  private extractToken(client: AuthenticatedSocket) {
    const rawCookie = client.handshake.headers.cookie;
    if (!rawCookie) {
      return null;
    }
    const match = rawCookie.match(/(?:^|;\s*)Authentication=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  private async ensureAuthenticated(client: AuthenticatedSocket) {
    if (client.data.user) {
      return client.data.user;
    }

    const user = await this.authenticate(client);
    client.data.user = user;
    await client.join(this.agentRoom(user.id));

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

  private conversationRoom(conversationId: string): RealtimeRoom {
    return `conversation:${conversationId}`;
  }
}
