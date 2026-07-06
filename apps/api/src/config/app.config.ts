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

  if (process.env.NODE_ENV === 'production') {
    if (!secret) {
      throw new Error('JWT_SECRET is required in production');
    }

    if (isInsecureSecret(secret, DEFAULT_JWT_SECRET)) {
      throw new Error('JWT_SECRET must be changed for production');
    }
  }

  return secret ?? DEFAULT_JWT_SECRET;
}

function getJwtRefreshSecret() {
  const secret = getEnv('JWT_REFRESH_SECRET');

  if (process.env.NODE_ENV === 'production') {
    if (!secret) {
      throw new Error('JWT_REFRESH_SECRET is required in production');
    }

    if (isInsecureSecret(secret, DEFAULT_JWT_REFRESH_SECRET)) {
      throw new Error('JWT_REFRESH_SECRET must be changed for production');
    }
  }

  return secret ?? DEFAULT_JWT_REFRESH_SECRET;
}

function isInsecureSecret(secret: string, defaultValue: string) {
  const normalized = secret.trim().toLowerCase();

  return (
    normalized === defaultValue ||
    normalized.includes('change-me') ||
    normalized.includes('local-env') ||
    normalized.length < 32
  );
}

export const appConfig = {
  apiPort: getNumberEnv('API_PORT') ?? getNumberEnv('PORT') ?? DEFAULT_API_PORT,
  jwtSecret: getJwtSecret(),
  jwtRefreshSecret: getJwtRefreshSecret(),
  realtimeNamespace: 'notifications',
  webOrigin: getEnv('WEB_ORIGIN') ?? DEFAULT_WEB_ORIGIN,
} as const;
