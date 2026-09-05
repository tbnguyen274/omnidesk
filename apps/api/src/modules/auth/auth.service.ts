import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import * as crypto from 'crypto';
import { appConfig } from '../../config/app.config';
import { JwtPayload } from '../../common/auth/current-user.type';
import { MailService } from '../../common/mail/mail.service';
import {
  AuditLogService,
  SYSTEM_DUMMY_UUID,
} from '../audit-log/audit-log.service';
import { RedisService } from '../../common/redis/redis.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_TTL_SECONDS = 900; // 15 minutes
const BLACKLIST_TTL_SECONDS = 900; // 15 minutes

export type AuthRequestContext = {
  ip?: string;
  userAgent?: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly auditLog: AuditLogService,
    private readonly redisService: RedisService,
  ) {}

  async login(dto: LoginDto, context?: AuthRequestContext) {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // 1. Check if account is currently locked due to repeated failed attempts
    const isLocked = await this.redisService
      .getClient()
      .get(`auth:locked:${normalizedEmail}`);
    if (isLocked) {
      throw new UnauthorizedException(
        'Account is temporarily locked due to excessive failed attempts. Please try again in 15 minutes.',
      );
    }

    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      await this.auditLog.log({
        actorId: null,
        action: 'auth.login.failure',
        targetType: 'User',
        targetId: SYSTEM_DUMMY_UUID,
        metadata: {
          ip: context?.ip,
          userAgent: context?.userAgent,
          attemptedEmail: dto.email,
          reason: 'user_not_found',
        },
      });
      await this.recordFailedAttempt(normalizedEmail);
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== UserStatus.ACTIVE) {
      await this.auditLog.log({
        actorId: null,
        action: 'auth.login.failure',
        targetType: 'User',
        targetId: user.id,
        metadata: {
          ip: context?.ip,
          userAgent: context?.userAgent,
          attemptedEmail: dto.email,
          reason: 'user_inactive',
        },
      });
      await this.recordFailedAttempt(normalizedEmail);
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await compare(dto.password, user.passwordHash);

    if (!isPasswordValid) {
      await this.auditLog.log({
        actorId: null,
        action: 'auth.login.failure',
        targetType: 'User',
        targetId: user.id,
        metadata: {
          ip: context?.ip,
          userAgent: context?.userAgent,
          attemptedEmail: dto.email,
          reason: 'invalid_credentials',
        },
      });
      await this.recordFailedAttempt(normalizedEmail);
      throw new UnauthorizedException('Invalid email or password');
    }

    // Clear failed attempts counter and lock on successful authentication
    await this.redisService
      .getClient()
      .del(`auth:failed_attempts:${normalizedEmail}`);
    await this.redisService.getClient().del(`auth:locked:${normalizedEmail}`);

    const jti = crypto.randomUUID();
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      jti,
    };

    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: appConfig.jwtRefreshSecret,
      expiresIn: '7d',
    });

    await this.usersService.setCurrentRefreshToken(refreshToken, user.id);

    await this.auditLog.log({
      actorId: user.id,
      action: 'auth.login.success',
      targetType: 'User',
      targetId: user.id,
      metadata: {
        ip: context?.ip,
        userAgent: context?.userAgent,
        method: 'password',
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  async logout(userId: string, jti?: string, context?: AuthRequestContext) {
    await this.usersService.removeRefreshToken(userId);

    if (jti) {
      await this.redisService
        .getClient()
        .set(`blacklist:jwt:${jti}`, '1', 'EX', BLACKLIST_TTL_SECONDS);
    }

    await this.auditLog.log({
      actorId: userId,
      action: 'auth.logout',
      targetType: 'User',
      targetId: userId,
      metadata: {
        ip: context?.ip,
        userAgent: context?.userAgent,
        revokedJti: jti ?? null,
      },
    });
  }

  async refreshTokens(userId: string, refreshToken: string, oldJti?: string) {
    const user = await this.usersService.findById(userId);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Access Denied');
    }

    const userWithHash =
      await this.usersService.findHashedRefreshTokenById(userId);

    if (!userWithHash?.hashedRefreshToken) {
      throw new UnauthorizedException('Access Denied');
    }

    const isRefreshTokenValid = await compare(
      refreshToken,
      userWithHash.hashedRefreshToken,
    );

    if (!isRefreshTokenValid) {
      throw new UnauthorizedException('Access Denied');
    }

    // Optionally blacklist the old access token jti during token rotation
    if (oldJti) {
      await this.redisService
        .getClient()
        .set(`blacklist:jwt:${oldJti}`, '1', 'EX', BLACKLIST_TTL_SECONDS);
    }

    const jti = crypto.randomUUID();
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      jti,
    };

    const newAccessToken = await this.jwtService.signAsync(payload);
    const newRefreshToken = await this.jwtService.signAsync(payload, {
      secret: appConfig.jwtRefreshSecret,
      expiresIn: '7d',
    });

    await this.usersService.setCurrentRefreshToken(newRefreshToken, user.id);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  async forgotPassword(dto: ForgotPasswordDto, context?: AuthRequestContext) {
    const user = await this.usersService.findByEmail(dto.email);

    await this.auditLog.log({
      actorId: user?.id ?? null,
      action: 'auth.password_reset.requested',
      targetType: 'User',
      targetId: user?.id ?? SYSTEM_DUMMY_UUID,
      metadata: {
        ip: context?.ip,
        userAgent: context?.userAgent,
        email: dto.email,
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      // Always return success to prevent email enumeration
      return { success: true };
    }

    const token = crypto.randomUUID();
    const expires = new Date();
    expires.setHours(expires.getHours() + 1); // 1 hour expiration

    await this.usersService.setPasswordResetToken(user.email, token, expires);

    const resetUrl = `${appConfig.webOrigin}/auth/reset-password?token=${token}`;

    await this.mailService.sendPasswordResetEmail(user.email, resetUrl);

    return { success: true };
  }

  async resetPassword(dto: ResetPasswordDto, context?: AuthRequestContext) {
    const user = await this.usersService.findByPasswordResetToken(dto.token);

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    const passwordHash = await hash(dto.newPassword, 10);
    await this.usersService.updatePasswordAndClearToken(user.id, passwordHash);

    // Revoke refresh tokens on password reset
    await this.usersService.removeRefreshToken(user.id);

    await this.auditLog.log({
      actorId: user.id,
      action: 'auth.password_reset.completed',
      targetType: 'User',
      targetId: user.id,
      metadata: {
        ip: context?.ip,
        userAgent: context?.userAgent,
      },
    });

    return { success: true };
  }

  /**
   * Tracks failed login attempts per email in Redis.
   * Uses atomic SET ... EX ... NX to initialize the attempts counter with TTL,
   * completely eliminating the race condition of a key existing without TTL.
   * Automatically locks the account for 15 minutes when 5 failed attempts occur.
   */
  private async recordFailedAttempt(normalizedEmail: string): Promise<void> {
    const attemptsKey = `auth:failed_attempts:${normalizedEmail}`;
    const lockKey = `auth:locked:${normalizedEmail}`;

    // Atomically set key to '0' with TTL if it does not exist (NX)
    await this.redisService
      .getClient()
      .set(attemptsKey, '0', 'EX', LOCKOUT_TTL_SECONDS, 'NX');

    const attempts = await this.redisService.getClient().incr(attemptsKey);

    if (attempts >= LOCKOUT_THRESHOLD) {
      await this.redisService
        .getClient()
        .set(lockKey, '1', 'EX', LOCKOUT_TTL_SECONDS);
      await this.redisService.getClient().del(attemptsKey);
      throw new UnauthorizedException(
        'Account is temporarily locked due to excessive failed attempts. Please try again in 15 minutes.',
      );
    }
  }
}
