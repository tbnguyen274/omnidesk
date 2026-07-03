import { Body, Controller, Get, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/auth/roles.decorator';
import { TagsService } from './tags.service';

@Controller('tags')
@Roles(UserRole.ADMIN, UserRole.AGENT)
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get()
  async list() {
    const data = await this.tagsService.list();
    return {
      success: true,
      data,
    };
  }

  @Post()
  async create(@Body() dto: { name: string; color?: string }) {
    const data = await this.tagsService.create(dto.name, dto.color);
    return {
      success: true,
      data,
    };
  }
}
