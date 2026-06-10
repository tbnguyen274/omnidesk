import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { CurrentUser as CurrentUserType } from './current-user.type';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentUserType | undefined => {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: CurrentUserType }>();
    return request.user;
  },
);
