import { Controller, Get } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/auth/roles.decorator';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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
