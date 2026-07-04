import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import * as crypto from 'crypto';
import * as nodemailer from 'nodemailer';
import { appConfig } from '../../config/app.config';
import { providerConfig } from '../../config/provider.config';
import { JwtPayload } from '../../common/auth/current-user.type';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await compare(dto.password, user.passwordHash);

    if (!isPasswordValid) {
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

  async logout(userId: string) {
    await this.usersService.removeRefreshToken(userId);
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

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user || user.status !== UserStatus.ACTIVE) {
      // Always return success to prevent email enumeration
      return { success: true };
    }

    const token = crypto.randomUUID();
    const expires = new Date();
    expires.setHours(expires.getHours() + 1); // 1 hour expiration

    await this.usersService.setPasswordResetToken(user.email, token, expires);

    const resetUrl = `${appConfig.webOrigin}/auth/reset-password?token=${token}`;

    if (
      providerConfig.email.outboundMode !== 'mock' &&
      providerConfig.email.smtp.host
    ) {
      const transporter = nodemailer.createTransport({
        host: providerConfig.email.smtp.host,
        port: providerConfig.email.smtp.port,
        secure: providerConfig.email.smtp.secure,
        auth: {
          user: providerConfig.email.smtp.user,
          pass: providerConfig.email.smtp.password,
        },
      });

      await transporter.sendMail({
        from: providerConfig.email.smtp.fromAddress,
        to: user.email,
        subject: 'Password Reset Request',
        text: `You requested a password reset. Please click the link to reset your password: ${resetUrl}`,
        html: `<p>You requested a password reset.</p><p><a href="${resetUrl}">Click here to reset your password</a>.</p>`,
      });
    } else {
      // In mock mode or missing SMTP config, log the URL to console for local testing
      console.log(`[Mock Email] Password reset requested for ${user.email}`);
      console.log(`[Mock Email] Click here to reset: ${resetUrl}`);
    }

    return { success: true };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.usersService.findByPasswordResetToken(dto.token);

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    const passwordHash = await hash(dto.newPassword, 10);
    await this.usersService.updatePasswordAndClearToken(user.id, passwordHash);

    // Optionally revoke refresh tokens here
    await this.usersService.removeRefreshToken(user.id);

    return { success: true };
  }
}
