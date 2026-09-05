import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { appConfig } from '../../config/app.config';
import { RedisModule } from '../redis/redis.module';
import { UsersModule } from '../../modules/users/users.module';
import { AuthTokenService } from './auth-token.service';

@Module({
  imports: [
    UsersModule,
    RedisModule,
    JwtModule.register({
      secret: appConfig.jwtSecret,
    }),
  ],
  providers: [AuthTokenService],
  exports: [AuthTokenService],
})
export class AuthTokenModule {}
