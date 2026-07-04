import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/auth/roles.decorator';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

@ApiTags('Users')
@ApiCookieAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({
    summary: 'List support agents',
    description: 'Retrieves a list of all users with the AGENT role.',
  })
  @Get('agents')
  @Roles(UserRole.ADMIN, UserRole.AGENT)
  async getAgents() {
    const data = await this.usersService.findAgents();
    return {
      success: true,
      data,
    };
  }

  @ApiOperation({
    summary: 'List all users',
    description:
      'Retrieves a list of all users in the system. Requires ADMIN role.',
  })
  @Get()
  @Roles(UserRole.ADMIN)
  async findAll() {
    const data = await this.usersService.findAll();
    return {
      success: true,
      data,
    };
  }

  @ApiOperation({
    summary: 'Create a new user',
    description:
      'Creates a new user and sends a welcome email. Requires ADMIN role.',
  })
  @Post()
  @Roles(UserRole.ADMIN)
  async create(@Body() dto: CreateUserDto) {
    const data = await this.usersService.create(dto);
    return {
      success: true,
      data,
    };
  }

  @ApiOperation({
    summary: 'Update user status',
    description:
      'Activates or deactivates a user account. Requires ADMIN role.',
  })
  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    const data = await this.usersService.updateStatus(id, dto);
    return {
      success: true,
      data,
    };
  }
}
