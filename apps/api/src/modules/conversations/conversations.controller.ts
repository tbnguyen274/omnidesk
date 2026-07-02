import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { ConversationsService } from './conversations.service';
import { ListConversationsDto } from './dto/list-conversations.dto';
import { UpdateConversationAssignmentDto } from './dto/update-conversation-assignment.dto';
import { UpdateConversationPriorityDto } from './dto/update-conversation-priority.dto';
import { UpdateConversationStatusDto } from './dto/update-conversation-status.dto';

@Controller('conversations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.AGENT)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  async list(@Query() query: ListConversationsDto) {
    const data = await this.conversationsService.list(query);
    return {
      success: true,
      data,
    };
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    const data = await this.conversationsService.findById(id);
    return {
      success: true,
      data,
    };
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateConversationStatusDto,
  ) {
    const data = await this.conversationsService.updateStatus(id, dto.status);
    return {
      success: true,
      data,
    };
  }

  @Patch(':id/priority')
  async updatePriority(
    @Param('id') id: string,
    @Body() dto: UpdateConversationPriorityDto,
  ) {
    const data = await this.conversationsService.updatePriority(
      id,
      dto.priority,
    );
    return {
      success: true,
      data,
    };
  }

  @Patch(':id/assignment')
  async updateAssignment(
    @Param('id') id: string,
    @Body() dto: UpdateConversationAssignmentDto,
  ) {
    const data = await this.conversationsService.updateAssignment(
      id,
      dto.assignedAgentId,
    );
    return {
      success: true,
      data,
    };
  }

  @Post(':id/tags')
  async addTag(@Param('id') id: string, @Body() dto: { tagId: string }) {
    const data = await this.conversationsService.addTag(id, dto.tagId);
    return {
      success: true,
      data,
    };
  }

  @Delete(':id/tags/:tagId')
  async removeTag(@Param('id') id: string, @Param('tagId') tagId: string) {
    const data = await this.conversationsService.removeTag(id, tagId);
    return {
      success: true,
      data,
    };
  }
}
