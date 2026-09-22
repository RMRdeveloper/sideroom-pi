import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const JEV_KEY_ENV_VAR = 'TYPESAFE_API_KEY';
export const SIDEROOM_CONFIG_FILE = 'sideroom.json';

const JEV_API_KEY_FIELD = 'jevApiKey';
const OWNER_ONLY_FILE_MODE = 0o600;
const OWNER_ONLY_DIRECTORY_MODE = 0o700;

export interface JevKeySource {
  readonly key: string;
  readonly origin: 'environment' | 'config';
}

export function configPathFor(agentDirectory: string): string {
  return join(agentDirectory, SIDEROOM_CONFIG_FILE);
}

// The environment wins so containers and CI work with no file at all. A missing
// or malformed config means "no key"; anything else about the file is a real
// problem and surfaces instead of hiding.
export function resolveApiKey(
  environment: Readonly<Record<string, string | undefined>>,
  configPath: string,
): JevKeySource | undefined {
  const fromEnvironment = environment[JEV_KEY_ENV_VAR]?.trim();
  if (fromEnvironment !== undefined && fromEnvironment.length > 0) {
    return { key: fromEnvironment, origin: 'environment' };
  }
  const stored = readStoredKey(configPath);
  if (stored === undefined) {
    return undefined;
  }
  return { key: stored, origin: 'config' };
}

export function readStoredKey(configPath: string): string | undefined {
  let raw: string;
  try {
    raw = readFileSync(configPath, 'utf8');
  } catch (error) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw error;
  }

  const parsed = parseConfig(raw);
  if (parsed === undefined) {
    return undefined;
  }
  const stored = parsed[JEV_API_KEY_FIELD];
  if (typeof stored !== 'string') {
    return undefined;
  }
  const trimmed = stored.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function storeApiKey(configPath: string, apiKey: string): void {
  mkdirSync(dirname(configPath), {
    recursive: true,
    mode: OWNER_ONLY_DIRECTORY_MODE,
  });
  const payload = `${JSON.stringify({ [JEV_API_KEY_FIELD]: apiKey }, null, 2)}\n`;
  writeFileSync(configPath, payload, {
    encoding: 'utf8',
    mode: OWNER_ONLY_FILE_MODE,
  });
}

export function clearStoredKey(configPath: string): void {
  rmSync(configPath, { force: true });
}

function parseConfig(raw: string): Record<string, unknown> | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return undefined;
  }
  return parsed as Record<string, unknown>;
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
