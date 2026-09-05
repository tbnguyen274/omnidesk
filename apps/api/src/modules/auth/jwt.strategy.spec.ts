import { UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthTokenService } from '../../common/auth/auth-token.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let authTokenService: {
    validatePayload: jest.Mock;
  };

  beforeEach(() => {
    authTokenService = {
      validatePayload: jest.fn(),
    };
    strategy = new JwtStrategy(authTokenService as unknown as AuthTokenService);
  });

  it('delegates validation to AuthTokenService.validatePayload', async () => {
    const payload = {
      sub: 'user-uuid-1',
      email: 'user@example.com',
      role: UserRole.AGENT,
    };
    const expectedUser = {
      id: 'user-uuid-1',
      email: 'user@example.com',
      name: 'Agent User',
      role: UserRole.AGENT,
    };

    authTokenService.validatePayload.mockResolvedValueOnce(expectedUser);

    const result = await strategy.validate(payload);

    expect(authTokenService.validatePayload).toHaveBeenCalledWith(payload);
    expect(result).toEqual(expectedUser);
  });

  it('propagates UnauthorizedException if AuthTokenService rejects', async () => {
    const payload = {
      sub: 'inactive-user',
      email: 'inactive@example.com',
      role: UserRole.AGENT,
    };

    authTokenService.validatePayload.mockRejectedValueOnce(
      new UnauthorizedException('Invalid token'),
    );

    await expect(strategy.validate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
