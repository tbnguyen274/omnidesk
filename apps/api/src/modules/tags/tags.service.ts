import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.tag.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(name: string, color?: string) {
    const existing = await this.prisma.tag.findUnique({
      where: { name: name.trim().toLowerCase() },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.tag.create({
      data: {
        name: name.trim().toLowerCase(),
        color: color || '#333333', // Default color if not provided
      },
    });
  }
}
