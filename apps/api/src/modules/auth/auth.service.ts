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
import { AuditLogService, SYSTEM_DUMMY_UUID } from '../audit-log/audit-log.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

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
  ) {}

  async login(dto: LoginDto, context?: AuthRequestContext) {
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
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
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

  async logout(userId: string, context?: AuthRequestContext) {
    await this.usersService.removeRefreshToken(userId);

    await this.auditLog.log({
      actorId: userId,
      action: 'auth.logout',
      targetType: 'User',
      targetId: userId,
      metadata: {
        ip: context?.ip,
        userAgent: context?.userAgent,
      },
    });
  }

  async refreshTokens(userId: string, refreshToken: string) {
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

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
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
}
