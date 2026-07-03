import './env-file';

const DEFAULT_API_PORT = 3000;
const DEFAULT_JWT_SECRET = 'change-me-in-local-env';
const DEFAULT_JWT_REFRESH_SECRET = 'refresh-change-me-in-local-env';
const DEFAULT_WEB_ORIGIN = 'http://localhost:3002';

function getEnv(name: string) {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : undefined;
}

function getNumberEnv(name: string) {
  const value = getEnv(name);

  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function getJwtSecret() {
  const secret = getEnv('JWT_SECRET');

  if (process.env.NODE_ENV === 'production' && !secret) {
    throw new Error('JWT_SECRET is required in production');
  }

  return secret ?? DEFAULT_JWT_SECRET;
}

function getJwtRefreshSecret() {
  const secret = getEnv('JWT_REFRESH_SECRET');

  if (process.env.NODE_ENV === 'production' && !secret) {
    throw new Error('JWT_REFRESH_SECRET is required in production');
  }

  return secret ?? DEFAULT_JWT_REFRESH_SECRET;
}

export const appConfig = {
  apiPort: getNumberEnv('API_PORT') ?? getNumberEnv('PORT') ?? DEFAULT_API_PORT,
  jwtSecret: getJwtSecret(),
  jwtRefreshSecret: getJwtRefreshSecret(),
  realtimeNamespace: 'notifications',
  webOrigin: getEnv('WEB_ORIGIN') ?? DEFAULT_WEB_ORIGIN,
} as const;
