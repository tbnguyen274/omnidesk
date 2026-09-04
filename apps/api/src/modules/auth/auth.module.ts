import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { appConfig } from '../../config/app.config';
import { PassportModule } from '@nestjs/passport';
import { MailModule } from '../../common/mail/mail.module';
import { UsersModule } from '../users/users.module';
import { AuthTokenModule } from '../../common/auth/auth-token.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { JwtRefreshStrategy } from './jwt-refresh.strategy';

@Module({
  imports: [
    // Direct dependency for AuthService (user lookups, password hashes, refresh tokens)
    UsersModule,
    MailModule,
    PassportModule,
    AuditLogModule,
    // Shared token validation layer for JwtStrategy (avoids circular dependency with NotificationsModule)
    AuthTokenModule,
    // Scoped JwtModule with default signOptions (15m expiration) for token issuance in AuthService.
    // Note: AuthTokenModule registers its own JwtModule instance solely for token verification.
    JwtModule.register({
      secret: appConfig.jwtSecret,
      signOptions: {
        expiresIn: '15m',
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtRefreshStrategy],
  exports: [AuthService],
})
export class AuthModule {}
