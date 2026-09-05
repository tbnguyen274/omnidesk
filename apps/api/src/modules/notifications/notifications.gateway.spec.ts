import { UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthTokenService } from '../../common/auth/auth-token.service';
import { NotificationsGateway } from './notifications.gateway';

describe('NotificationsGateway Authentication', () => {
  let gateway: NotificationsGateway;
  let authTokenService: {
    validateToken: jest.Mock;
  };

  beforeEach(() => {
    authTokenService = {
      validateToken: jest.fn(),
    };
    gateway = new NotificationsGateway(
      authTokenService as unknown as AuthTokenService,
    );
  });

  function createMockSocket(overrides: {
    auth?: Record<string, unknown>;
    headers?: Record<string, string>;
    query?: Record<string, string>;
  }) {
    return {
      id: 'socket-id-1',
      data: {},
      handshake: {
        auth: overrides.auth || {},
        headers: overrides.headers || {},
        query: overrides.query || {},
      },
      join: jest.fn().mockResolvedValue(undefined),
      emit: jest.fn(),
      disconnect: jest.fn(),
    } as any;
  }

  it('authenticates via handshake auth.token', async () => {
    const client = createMockSocket({
      auth: { token: 'jwt-via-auth-object' },
    });
    const mockUser = {
      id: 'user-1',
      email: 'user@example.com',
      name: 'Agent User',
      role: UserRole.AGENT,
    };
    authTokenService.validateToken.mockResolvedValueOnce(mockUser);

    await gateway.handleConnection(client);

    expect(authTokenService.validateToken).toHaveBeenCalledWith(
      'jwt-via-auth-object',
    );
    expect(client.data.user).toEqual(mockUser);
    expect(client.join).toHaveBeenCalledWith('agent:user-1');
    expect(client.join).toHaveBeenCalledWith('team:inbox');
  });

  it('authenticates via Authorization Bearer header', async () => {
    const client = createMockSocket({
      headers: { authorization: 'Bearer jwt-via-bearer-header' },
    });
    const mockUser = {
      id: 'user-2',
      email: 'admin@example.com',
      name: 'Admin User',
      role: UserRole.ADMIN,
    };
    authTokenService.validateToken.mockResolvedValueOnce(mockUser);

    await gateway.handleConnection(client);

    expect(authTokenService.validateToken).toHaveBeenCalledWith(
      'jwt-via-bearer-header',
    );
    expect(client.data.user).toEqual(mockUser);
  });

  it('rejects Authorization header without Bearer prefix', async () => {
    const client = createMockSocket({
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });

    await gateway.handleConnection(client);

    expect(authTokenService.validateToken).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('authenticates via Authentication cookie', async () => {
    const client = createMockSocket({
      headers: { cookie: 'other=123; Authentication=jwt-via-cookie; foo=bar' },
    });
    const mockUser = {
      id: 'user-3',
      email: 'user3@example.com',
      name: 'User 3',
      role: UserRole.AGENT,
    };
    authTokenService.validateToken.mockResolvedValueOnce(mockUser);

    await gateway.handleConnection(client);

    expect(authTokenService.validateToken).toHaveBeenCalledWith(
      'jwt-via-cookie',
    );
    expect(client.data.user).toEqual(mockUser);
  });

  it('ignores query parameter token and disconnects when no valid transport is provided', async () => {
    const client = createMockSocket({
      query: { token: 'jwt-via-query-string' },
    });

    await gateway.handleConnection(client);

    expect(authTokenService.validateToken).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith('realtime.error', {
      message: 'Unauthorized',
    });
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('disconnects and emits error when authTokenService rejects token', async () => {
    const client = createMockSocket({
      auth: { token: 'invalid-token' },
    });
    authTokenService.validateToken.mockRejectedValueOnce(
      new UnauthorizedException('Invalid token'),
    );

    await gateway.handleConnection(client);

    expect(client.emit).toHaveBeenCalledWith('realtime.error', {
      message: 'Unauthorized',
    });
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });
});
