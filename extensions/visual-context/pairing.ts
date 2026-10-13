import { randomBytes, randomUUID } from 'node:crypto';
import {
  chmodSync,
  linkSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import type { AddressInfo } from 'node:net';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { type Static, Type } from 'typebox';
import { Check } from 'typebox/value';
import { isMissingFile } from '../shared/read-file.ts';
import { BRIDGE_PATH } from './model.ts';

const PairingSchema = Type.Object(
  {
    version: Type.Literal(2),
    port: Type.Integer({ minimum: 1024, maximum: 65535 }),
    token: Type.String({ pattern: '^[a-f0-9]{64}$' }),
  },
  { additionalProperties: false },
);
export type PairingIdentity = Static<typeof PairingSchema>;
const DIRECTORY = 'sideroom-visual-context';
const FILE = 'connection.json';

export function readPairing(
  agentDirectory: string,
): PairingIdentity | undefined {
  const path = join(agentDirectory, DIRECTORY, FILE);
  let source: string;
  try {
    source = readFileSync(path, 'utf8');
  } catch (cause) {
    if (isMissingFile(cause)) {
      return undefined;
    }
    throw new Error('Cannot read browser authorization.', { cause });
  }
  const invalidMessage = `Invalid browser authorization in ${path}.`;
  let identity: unknown;
  try {
    identity = JSON.parse(source);
  } catch (cause) {
    throw new Error(invalidMessage, { cause });
  }
  if (!Check(PairingSchema, identity)) {
    throw new Error(invalidMessage);
  }
  return identity;
}

export async function ensurePairing(
  agentDirectory: string,
): Promise<PairingIdentity> {
  const existing = readPairing(agentDirectory);
  if (existing) {
    return existing;
  }
  const reservation = createServer();
  await new Promise<void>((resolve, reject) => {
    reservation.once('error', reject);
    reservation.listen(0, '127.0.0.1', resolve);
  });
  const identity: PairingIdentity = {
    version: 2,
    port: (reservation.address() as AddressInfo).port,
    token: randomBytes(32).toString('hex'),
  };
  await new Promise<void>((resolve, reject) =>
    reservation.close((error) => (error ? reject(error) : resolve())),
  );
  const directory = join(agentDirectory, DIRECTORY);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') {
    chmodSync(directory, 0o700);
  }
  const staging = join(directory, `${randomUUID()}.json`);
  writeFileSync(staging, `${JSON.stringify(identity)}\n`, {
    mode: 0o600,
    flag: 'wx',
  });
  try {
    // Linking a complete file prevents concurrent Pi processes from reading
    // a half-written credential or replacing another process's identity.
    linkSync(staging, join(directory, FILE));
  } catch (cause) {
    if (!hasCode(cause, 'EEXIST')) {
      throw new Error('Cannot save browser authorization.', { cause });
    }
  } finally {
    unlinkSync(staging);
  }
  const saved = readPairing(agentDirectory);
  if (!saved) {
    throw new Error('Browser authorization disappeared while saving.');
  }
  return saved;
}

export function pairingAddress(identity: PairingIdentity): string {
  return `${endpoint(identity)}#${identity.token}`;
}

export function endpoint(identity: PairingIdentity): string {
  return `ws://127.0.0.1:${String(identity.port)}${BRIDGE_PATH}`;
}

export function hasCode(cause: unknown, code: string): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === code;
}
