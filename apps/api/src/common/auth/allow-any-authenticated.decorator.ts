import { SetMetadata } from '@nestjs/common';

export const ALLOW_ANY_AUTHENTICATED_KEY = 'allowAnyAuthenticated';

/**
 * Decorator to explicitly allow ANY authenticated user to access this endpoint,
 * regardless of their role. Used for personal endpoints such as /me, /logout.
 *
 * In combination with RolesGuard's default Deny-All policy, this ensures
 * endpoints without @Roles(...) or @AllowAnyAuthenticated() are blocked by default.
 */
export const AllowAnyAuthenticated = () =>
  SetMetadata(ALLOW_ANY_AUTHENTICATED_KEY, true);
