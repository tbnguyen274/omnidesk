import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { hash } from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../../common/database/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { appConfig } from '../../config/app.config';
import { AuditLogService } from '../audit-log/audit-log.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly auditLog: AuditLogService,
  ) {}

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

  private hashResetToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async findByPasswordResetToken(token: string) {
    const hashedToken = this.hashResetToken(token);
    return this.prisma.user.findFirst({
      where: {
        passwordResetToken: hashedToken,
        passwordResetExpires: {
          gt: new Date(),
        },
      },
    });
  }

  async setPasswordResetToken(email: string, token: string, expires: Date) {
    const hashedToken = this.hashResetToken(token);
    await this.prisma.user.update({
      where: { email },
      data: {
        passwordResetToken: hashedToken,
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

  async create(dto: CreateUserDto, creatorId?: string) {
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
    const hashedToken = this.hashResetToken(token);
    const expires = new Date();
    expires.setDate(expires.getDate() + 7); // 7 days to set initial password

    const newUser = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        role: dto.role,
        passwordHash,
        passwordResetToken: hashedToken,
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

    await this.mailService.sendWelcomeEmail(
      { name: newUser.name, email: newUser.email, role: newUser.role },
      resetUrl,
    );

    await this.auditLog.log({
      actorId: creatorId ?? null,
      action: 'user.created',
      targetType: 'User',
      targetId: newUser.id,
      metadata: {
        email: newUser.email,
        role: newUser.role,
        createdBy: creatorId ?? 'system',
      },
    });

    return newUser;
  }

  async updateStatus(id: string, dto: UpdateUserStatusDto, actorId?: string) {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updatedUser = await this.prisma.user.update({
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

    await this.auditLog.log({
      actorId: actorId ?? null,
      action: 'user.status_updated',
      targetType: 'User',
      targetId: id,
      metadata: {
        email: user.email,
        previousStatus: user.status,
        newStatus: dto.status,
      },
    });

    return updatedUser;
  }
}
