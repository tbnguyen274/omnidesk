import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import { compare } from 'bcryptjs';
import { appConfig } from '../../config/app.config';
import { JwtPayload } from '../../common/auth/current-user.type';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';

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
}
