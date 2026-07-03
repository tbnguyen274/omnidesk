import { Injectable } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { PrismaService } from '../../common/database/prisma.service';

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
}
