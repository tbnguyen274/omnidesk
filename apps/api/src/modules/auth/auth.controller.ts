import { Body, Controller, Get, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { CurrentUser as CurrentUserType } from '../../common/auth/current-user.type';
import { Public } from '../../common/auth/public.decorator';
import { JwtRefreshGuard } from '../../common/auth/jwt-refresh.guard';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const data = await this.authService.login(dto);

    // Set HttpOnly cookie for the access token (15 minutes)
    res.cookie('Authentication', data.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
    });

    // Set HttpOnly cookie for the refresh token (7 days)
    res.cookie('Refresh', data.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth/refresh', // only sent to the refresh endpoint
    });

    return {
      success: true,
      data: {
        user: data.user,
      },
    };
  }

  @Get('me')
  async me(@CurrentUser() user: CurrentUserType) {
    const currentUser = await this.usersService.findById(user.id);
    return {
      success: true,
      data: currentUser,
    };
  }

  @Public()
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  async refresh(@CurrentUser() user: CurrentUserType, @Res({ passthrough: true }) res: Response) {
    // CurrentUser will contain the decoded JWT payload from the Refresh token,
    // including the raw refreshToken (added in JwtRefreshStrategy)
    const data = await this.authService.refreshTokens(user.id, (user as any).refreshToken);

    res.cookie('Authentication', data.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
    });

    res.cookie('Refresh', data.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth/refresh',
    });

    return {
      success: true,
    };
  }

  @Post('logout')
  async logout(@CurrentUser() user: CurrentUserType, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(user.id);

    res.clearCookie('Authentication');
    res.clearCookie('Refresh', { path: '/api/auth/refresh' });

    return {
      success: true,
    };
  }
}
