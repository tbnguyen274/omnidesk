import { UserRole } from '@prisma/client';

export type CurrentUser = {
  id: string;
  email: string;
  role: UserRole;
};

export type JwtPayload = {
  sub: string;
  email: string;
  role: UserRole;
};
