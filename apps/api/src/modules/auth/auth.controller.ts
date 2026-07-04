import { Body, Controller, Get, Post, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { CurrentUser as CurrentUserType } from '../../common/auth/current-user.type';
import { Public } from '../../common/auth/public.decorator';
import { JwtRefreshGuard } from '../../common/auth/jwt-refresh.guard';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Public()
  @ApiOperation({
    summary: 'User login',
    description:
      'Authenticates a user using email and password. Sets HTTP-only cookies for authentication and refresh tokens.',
  })
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
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

  @ApiOperation({
    summary: 'Get current user profile',
    description:
      'Retrieves the profile information of the currently authenticated user.',
  })
  @ApiCookieAuth()
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
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Issues a new authentication token using a valid refresh token from cookies.',
  })
  @ApiCookieAuth()
  @Post('refresh')
  async refresh(
    @CurrentUser() user: CurrentUserType,
    @Res({ passthrough: true }) res: Response,
  ) {
    // CurrentUser will contain the decoded JWT payload from the Refresh token,
    // including the raw refreshToken (added in JwtRefreshStrategy)
    const data = await this.authService.refreshTokens(
      user.id,
      (user as any).refreshToken,
    );

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

  @ApiOperation({
    summary: 'User logout',
    description:
      'Clears authentication and refresh cookies, effectively logging the user out of the system.',
  })
  @ApiCookieAuth()
  @Post('logout')
  async logout(
    @CurrentUser() user: CurrentUserType,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(user.id);

    res.clearCookie('Authentication');
    res.clearCookie('Refresh', { path: '/api/auth/refresh' });

    return {
      success: true,
    };
  }

  @Public()
  @ApiOperation({
    summary: 'Request password reset',
    description: 'Sends a password reset email if the user exists.',
  })
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    const result = await this.authService.forgotPassword(dto);
    return {
      success: true,
      data: result,
    };
  }

  @Public()
  @ApiOperation({
    summary: 'Reset password',
    description: 'Resets the password using a valid reset token.',
  })
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    const result = await this.authService.resetPassword(dto);
    return {
      success: true,
      data: result,
    };
  }
}
