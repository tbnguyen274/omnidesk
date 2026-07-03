import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/auth/roles.decorator';
import { UsersService } from './users.service';

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
}
