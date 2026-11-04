import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createEventBus,
  type ExtensionAPI,
  type ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import {
  type CheckStatus,
  readCheckStatus,
  registerCheckStatus,
} from './check-status.ts';

const CHECK_STATUS_CHANNEL = 'sideroom:check-status';
const CHECK_COMMAND = 'npm run check';

interface CheckStatusRequest {
  ctx: ExtensionContext;
  status: CheckStatus | undefined;
}

function createEventApi() {
  const bus = createEventBus();
  return {
    bus,
    pi: {
      events: {
        on: (name: string, handler: (payload: unknown) => void) =>
          bus.on(name, handler),
        emit: (name: string, payload: unknown) => bus.emit(name, payload),
      },
    } as unknown as ExtensionAPI,
  };
}

const WORKING_CONTEXT = { cwd: '/work', mode: 'tui' } as ExtensionContext;

test('returns the observed check status for the asking context', () => {
  const { pi } = createEventApi();
  const status: CheckStatus = {
    command: CHECK_COMMAND,
    green: true,
    outcome: 'passed',
  };
  const askedContexts: ExtensionContext[] = [];
  registerCheckStatus(pi, (ctx) => {
    askedContexts.push(ctx);
    return status;
  });
  assert.deepEqual(readCheckStatus(pi, WORKING_CONTEXT), status);
  assert.deepEqual(askedContexts, [WORKING_CONTEXT]);
});

test('returns nothing when no check result was observed', () => {
  const { pi } = createEventApi();
  assert.equal(readCheckStatus(pi, WORKING_CONTEXT), undefined);
});

test('reads its answer from a listener on the shared check status channel', () => {
  const { pi, bus } = createEventApi();
  const status: CheckStatus = {
    command: CHECK_COMMAND,
    green: false,
    outcome: 'failed',
  };
  bus.on(CHECK_STATUS_CHANNEL, (payload) => {
    (payload as CheckStatusRequest).status = status;
  });
  assert.deepEqual(readCheckStatus(pi, WORKING_CONTEXT), status);
});
