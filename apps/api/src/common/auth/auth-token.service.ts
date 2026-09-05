import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { appConfig } from '../../config/app.config';
import { RedisService } from '../redis/redis.service';
import { UsersService } from '../../modules/users/users.service';
import type { AuthenticatedUser, JwtPayload } from './current-user.type';

@Injectable()
export class AuthTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Validates a raw JWT string (signature + expiry + active user status in DB).
   * Used by WebSockets, guards, or manual token verifications.
   */
  async validateToken(token: string): Promise<AuthenticatedUser> {
    if (!token || typeof token !== 'string') {
      throw new UnauthorizedException('Missing token');
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: appConfig.jwtSecret,
      });
      return await this.validatePayload(payload);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid token');
    }
  }

  /**
   * Validates an already-extracted JWT payload by checking Redis token blacklist
   * and the database for an ACTIVE user.
   * Used by JwtStrategy after passport-jwt has decoded and verified the signature.
   */
  async validatePayload(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!payload?.sub) {
      throw new UnauthorizedException('Invalid token');
    }

    if (payload.jti) {
      const isRevoked = await this.redisService
        .getClient()
        .get(`blacklist:jwt:${payload.jti}`);
      if (isRevoked) {
        throw new UnauthorizedException('Token has been revoked');
      }
    }

    const user = await this.usersService.findById(payload.sub);

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid token');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      jti: payload.jti,
    };
  }
}
