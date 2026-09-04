import { UserRole } from '@prisma/client';

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

export type CurrentUser = AuthenticatedUser;

export type JwtPayload = {
  sub: string;
  email: string;
  role: UserRole;
};
