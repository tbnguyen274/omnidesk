import './env-file';

type ProviderMode = 'mock' | 'live' | 'hybrid';

const DEFAULT_EMAIL_IMAP_PORT = 993;
const DEFAULT_EMAIL_IMAP_SECURE = true;
const DEFAULT_EMAIL_SMTP_PORT = 587;
const DEFAULT_EMAIL_SMTP_SECURE = false;
const DEFAULT_EMAIL_POLL_INTERVAL_MS = 30000;
const DEFAULT_EMAIL_SYNC_SINCE_MINUTES = 60;
const DEFAULT_EMAIL_SYNC_MAX_MESSAGES = 10;
const DEFAULT_FACEBOOK_GRAPH_API_VERSION = 'v20.0';
const DEFAULT_FACEBOOK_WEBHOOK_SIGNATURE_REQUIRED = true;

function getEnv(name: string) {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : undefined;
}

function getNumberEnv(name: string, fallback: number) {
  const value = getEnv(name);

  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function getBooleanEnv(name: string, fallback: boolean) {
  const value = getEnv(name);

  if (!value) {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function getProviderMode(name: string): ProviderMode {
  const value = getEnv(name) ?? 'mock';

  if (value === 'mock' || value === 'live' || value === 'hybrid') {
    return value;
  }

  throw new Error(`${name} must be one of: mock, live, hybrid`);
}

export const providerConfig = {
  email: {
    providerMode: getProviderMode('EMAIL_PROVIDER_MODE'),
    inboundMode: getProviderMode('EMAIL_INBOUND_MODE'),
    outboundMode: getProviderMode('EMAIL_OUTBOUND_MODE'),
    imap: {
      host: getEnv('EMAIL_IMAP_HOST'),
      port: getNumberEnv('EMAIL_IMAP_PORT', DEFAULT_EMAIL_IMAP_PORT),
      secure: getBooleanEnv('EMAIL_IMAP_SECURE', DEFAULT_EMAIL_IMAP_SECURE),
      user: getEnv('EMAIL_IMAP_USER'),
      password: getEnv('EMAIL_IMAP_PASSWORD'),
    },
    smtp: {
      host: getEnv('EMAIL_SMTP_HOST'),
      port: getNumberEnv('EMAIL_SMTP_PORT', DEFAULT_EMAIL_SMTP_PORT),
      secure: getBooleanEnv('EMAIL_SMTP_SECURE', DEFAULT_EMAIL_SMTP_SECURE),
      user: getEnv('EMAIL_SMTP_USER'),
      password: getEnv('EMAIL_SMTP_PASSWORD'),
      fromAddress: getEnv('EMAIL_FROM_ADDRESS'),
    },
    pollIntervalMs: getNumberEnv(
      'EMAIL_POLL_INTERVAL_MS',
      DEFAULT_EMAIL_POLL_INTERVAL_MS,
    ),
    syncSinceMinutes: getNumberEnv(
      'EMAIL_SYNC_SINCE_MINUTES',
      DEFAULT_EMAIL_SYNC_SINCE_MINUTES,
    ),
    syncMaxMessages: getNumberEnv(
      'EMAIL_SYNC_MAX_MESSAGES',
      DEFAULT_EMAIL_SYNC_MAX_MESSAGES,
    ),
  },
  facebook: {
    providerMode: getProviderMode('FACEBOOK_PROVIDER_MODE'),
    appId: getEnv('FACEBOOK_APP_ID'),
    appSecret: getEnv('FACEBOOK_APP_SECRET'),
    verifyToken: getEnv('FACEBOOK_VERIFY_TOKEN'),
    pageId: getEnv('FACEBOOK_PAGE_ID'),
    pageAccessToken: getEnv('FACEBOOK_PAGE_ACCESS_TOKEN'),
    graphApiVersion:
      getEnv('FACEBOOK_GRAPH_API_VERSION') ??
      DEFAULT_FACEBOOK_GRAPH_API_VERSION,
    webhookSignatureRequired: getBooleanEnv(
      'FACEBOOK_WEBHOOK_SIGNATURE_REQUIRED',
      DEFAULT_FACEBOOK_WEBHOOK_SIGNATURE_REQUIRED,
    ),
  },
} as const;

export function validateProviderConfig() {
  const errors: string[] = [];

  if (providerConfig.email.inboundMode === 'live') {
    requireFields(errors, 'EMAIL live inbound', {
      EMAIL_IMAP_HOST: providerConfig.email.imap.host,
      EMAIL_IMAP_USER: providerConfig.email.imap.user,
      EMAIL_IMAP_PASSWORD: providerConfig.email.imap.password,
    });
  }

  if (providerConfig.email.outboundMode === 'live') {
    requireFields(errors, 'EMAIL live outbound', {
      EMAIL_SMTP_HOST: providerConfig.email.smtp.host,
      EMAIL_SMTP_USER: providerConfig.email.smtp.user,
      EMAIL_SMTP_PASSWORD: providerConfig.email.smtp.password,
      EMAIL_FROM_ADDRESS: providerConfig.email.smtp.fromAddress,
    });
  }

  if (providerConfig.facebook.providerMode === 'live') {
    requireFields(errors, 'FACEBOOK live provider', {
      FACEBOOK_APP_SECRET: providerConfig.facebook.appSecret,
      FACEBOOK_VERIFY_TOKEN: providerConfig.facebook.verifyToken,
      FACEBOOK_PAGE_ID: providerConfig.facebook.pageId,
      FACEBOOK_PAGE_ACCESS_TOKEN: providerConfig.facebook.pageAccessToken,
    });
  }

  if (errors.length > 0) {
    throw new Error(`Invalid provider configuration: ${errors.join('; ')}`);
  }
}

function requireFields(
  errors: string[],
  scope: string,
  fields: Record<string, string | undefined>,
) {
  for (const [name, value] of Object.entries(fields)) {
    if (!value) {
      errors.push(`${scope} requires ${name}`);
    }
  }
}
