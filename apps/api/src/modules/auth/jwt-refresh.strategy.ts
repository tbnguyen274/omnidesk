import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { appConfig } from '../../config/app.config';
import { JwtPayload } from '../../common/auth/current-user.type';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          return request?.cookies?.Refresh;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: appConfig.jwtRefreshSecret,
      passReqToCallback: true,
    });
  }

  validate(request: Request, payload: JwtPayload) {
    const refreshToken = request?.cookies?.Refresh;
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      refreshToken,
    };
  }
}
