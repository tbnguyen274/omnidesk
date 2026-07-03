import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/auth/roles.decorator';
import { TagsService } from './tags.service';

@ApiTags('Tags')
@ApiCookieAuth()
@Controller('tags')
@Roles(UserRole.ADMIN, UserRole.AGENT)
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @ApiOperation({
    summary: 'List all tags',
    description: 'Retrieves all available tags that can be applied to conversations.',
  })
  @Get()
  async list() {
    const data = await this.tagsService.list();
    return {
      success: true,
      data,
    };
  }

  @ApiOperation({
    summary: 'Create a new tag',
    description: 'Creates a new customizable tag with a specific name and color.',
  })
  @Post()
  async create(@Body() dto: { name: string; color?: string }) {
    const data = await this.tagsService.create(dto.name, dto.color);
    return {
      success: true,
      data,
    };
  }
}
