import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const initialEnvKeys = new Set(Object.keys(process.env));

loadEnvFiles([
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), 'apps/worker/.env'),
  resolve(process.cwd(), '../../.env'),
]);

function loadEnvFiles(paths: string[]) {
  for (const path of unique(paths)) {
    if (!existsSync(path)) {
      continue;
    }

    const content = readFileSync(path, 'utf8');

    for (const line of content.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);

      if (!parsed || initialEnvKeys.has(parsed.key)) {
        continue;
      }

      process.env[parsed.key] = parsed.value;
    }
  }
}

function parseEnvLine(line: string) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith('#')) {
    return undefined;
  }

  const equalsIndex = trimmed.indexOf('=');

  if (equalsIndex < 1) {
    return undefined;
  }

  const key = trimmed.slice(0, equalsIndex).trim();
  const rawValue = trimmed.slice(equalsIndex + 1).trim();
  const value = stripQuotes(rawValue);

  return { key, value };
}

function stripQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}
