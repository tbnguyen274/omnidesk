import { UserRole } from '@prisma/client';

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  jti?: string;
};

export type CurrentUser = AuthenticatedUser;

export type JwtPayload = {
  sub: string;
  email: string;
  role: UserRole;
  jti?: string;
};
