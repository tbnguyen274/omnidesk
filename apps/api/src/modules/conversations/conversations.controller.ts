import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/auth/roles.decorator';
import { ConversationsService } from './conversations.service';
import { ListConversationsDto } from './dto/list-conversations.dto';
import { UpdateConversationAssignmentDto } from './dto/update-conversation-assignment.dto';
import { UpdateConversationPriorityDto } from './dto/update-conversation-priority.dto';
import { UpdateConversationStatusDto } from './dto/update-conversation-status.dto';
import { UpdateConversationReadStatusDto } from './dto/update-conversation-read-status.dto';

@ApiTags('Conversations')
@ApiCookieAuth()
@Controller('conversations')
@Roles(UserRole.ADMIN, UserRole.AGENT)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @ApiOperation({
    summary: 'Retrieve conversations',
    description:
      'Returns a paginated list of conversations. Supports filtering by status, priority, and agent.',
  })
  @Get()
  async list(@Query() query: ListConversationsDto) {
    const data = await this.conversationsService.list(query);
    return {
      success: true,
      data,
    };
  }

  @ApiOperation({
    summary: 'Get conversation details',
    description: 'Retrieves detailed metadata for a specific conversation.',
  })
  @Get(':id')
  async findById(@Param('id') id: string) {
    const data = await this.conversationsService.findById(id);
    return {
      success: true,
      data,
    };
  }

  @ApiOperation({
    summary: 'List conversation messages',
    description:
      'Retrieves a paginated list of messages associated with a specific conversation.',
  })
  @Get(':id/messages')
  async getMessages(
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const limitNumber = limit ? parseInt(limit, 10) : 50;
    const data = await this.conversationsService.getMessages(
      id,
      cursor,
      limitNumber,
    );
    return {
      success: true,
      data,
    };
  }

  @ApiOperation({
    summary: 'Update conversation status',
    description:
      'Changes the status of a conversation (e.g., OPEN, SNOOZED, CLOSED) with optimistic concurrency control.',
  })
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateConversationStatusDto,
  ) {
    const data = await this.conversationsService.updateStatus(
      id,
      dto.status,
      dto.version,
    );
    return {
      success: true,
      data,
    };
  }

  @ApiOperation({
    summary: 'Update conversation priority',
    description:
      'Modifies the priority level (e.g., LOW, NORMAL, HIGH, URGENT) of a conversation.',
  })
  @Patch(':id/priority')
  async updatePriority(
    @Param('id') id: string,
    @Body() dto: UpdateConversationPriorityDto,
  ) {
    const data = await this.conversationsService.updatePriority(
      id,
      dto.priority,
      dto.version,
    );
    return {
      success: true,
      data,
    };
  }

  @ApiOperation({
    summary: 'Update read status',
    description: 'Marks a conversation as read or unread.',
  })
  @Patch(':id/read-status')
  async updateReadStatus(
    @Param('id') id: string,
    @Body() dto: UpdateConversationReadStatusDto,
  ) {
    const data = await this.conversationsService.updateReadStatus(
      id,
      dto.isRead,
      dto.version,
    );
    return {
      success: true,
      data,
    };
  }

  @ApiOperation({
    summary: 'Assign agent to conversation',
    description:
      'Assigns or re-assigns a conversation to a specific support agent.',
  })
  @Patch(':id/assignment')
  async updateAssignment(
    @Param('id') id: string,
    @Body() dto: UpdateConversationAssignmentDto,
  ) {
    const data = await this.conversationsService.updateAssignment(
      id,
      dto.assignedAgentId,
      dto.version,
    );
    return {
      success: true,
      data,
    };
  }

  @ApiOperation({
    summary: 'Add tag to conversation',
    description:
      'Associates a specific tag with the conversation for categorization.',
  })
  @Post(':id/tags')
  async addTag(@Param('id') id: string, @Body() dto: { tagId: string }) {
    const data = await this.conversationsService.addTag(id, dto.tagId);
    return {
      success: true,
      data,
    };
  }

  @ApiOperation({
    summary: 'Remove tag from conversation',
    description: 'Removes an existing tag from the conversation.',
  })
  @Delete(':id/tags/:tagId')
  async removeTag(@Param('id') id: string, @Param('tagId') tagId: string) {
    const data = await this.conversationsService.removeTag(id, tagId);
    return {
      success: true,
      data,
    };
  }
}
