import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { hash } from 'bcryptjs';
import * as crypto from 'crypto';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../../common/database/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { providerConfig } from '../../config/provider.config';
import { appConfig } from '../../config/app.config';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  findHashedRefreshTokenById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { hashedRefreshToken: true },
    });
  }

  findAgents() {
    return this.prisma.user.findMany({
      where: {
        role: 'AGENT',
        status: 'ACTIVE',
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async setCurrentRefreshToken(refreshToken: string, userId: string) {
    const hashedRefreshToken = await hash(refreshToken, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { hashedRefreshToken },
    });
  }

  async removeRefreshToken(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { hashedRefreshToken: null },
    });
  }

  async findByPasswordResetToken(token: string) {
    return this.prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpires: {
          gt: new Date(),
        },
      },
    });
  }

  async setPasswordResetToken(email: string, token: string, expires: Date) {
    await this.prisma.user.update({
      where: { email },
      data: {
        passwordResetToken: token,
        passwordResetExpires: expires,
      },
    });
  }

  async updatePasswordAndClearToken(userId: string, passwordHash: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });
  }

  async findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateUserDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    // Generate random secure password
    const rawPassword = crypto.randomBytes(16).toString('hex');
    const passwordHash = await hash(rawPassword, 10);

    // Generate reset token for the welcome email
    const token = crypto.randomUUID();
    const expires = new Date();
    expires.setDate(expires.getDate() + 7); // 7 days to set initial password

    const newUser = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        role: dto.role,
        passwordHash,
        passwordResetToken: token,
        passwordResetExpires: expires,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

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
        to: newUser.email,
        subject: 'Welcome to OmniDesk! Set up your account',
        text: `Hello ${newUser.name}, welcome to OmniDesk. Please set your password by clicking this link: ${resetUrl}`,
        html: `<p>Hello ${newUser.name},</p><p>Welcome to OmniDesk! You have been invited as a ${newUser.role}.</p><p><a href="${resetUrl}">Click here to set your password and log in</a>.</p>`,
      });
    } else {
      console.log(`[Mock Email] Welcome email for ${newUser.email}`);
      console.log(`[Mock Email] Set password link: ${resetUrl}`);
    }

    return newUser;
  }

  async updateStatus(id: string, dto: UpdateUserStatusDto) {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.user.update({
      where: { id },
      data: { status: dto.status },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
      },
    });
  }
}
