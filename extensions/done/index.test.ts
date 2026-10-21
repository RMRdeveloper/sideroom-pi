import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  createEventBus,
  type ExtensionAPI,
  type ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { readCheckStatus } from '../shared/check-status.ts';
import registerDone from './index.ts';

type EventHandler = (event: never, ctx: ExtensionContext) => unknown;

function register(scripts: Record<string, string> = { check: 'x' }) {
  const handlers = new Map<string, EventHandler>();
  const pi = {
    on(name: string, handler: EventHandler) {
      handlers.set(name, handler);
    },
    events: createEventBus(),
    sendMessage() {
      assert.fail('check observation must never send a message');
    },
  } as unknown as ExtensionAPI;
  const cwd = mkdtempSync(join(tmpdir(), 'sideroom-done-'));
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ scripts }));
  const ctx = { cwd } as ExtensionContext;
  registerDone(pi);

  function emit(name: string, event: unknown): void {
    const handler = handlers.get(name);
    assert.ok(handler, name);
    handler(event as never, ctx);
  }
  function check(command: string, isError = false): void {
    emit('tool_call', { toolName: 'bash', toolCallId: 'check', input: { command } });
    emit('tool_result', { toolName: 'bash', toolCallId: 'check', isError });
  }
  function mutate(isError = false): void {
    emit('tool_call', { toolName: 'write', toolCallId: 'write', input: { path: 'src/app.ts' } });
    emit('tool_result', { toolName: 'write', toolCallId: 'write', isError });
  }
  return {
    handlers,
    emit,
    check,
    mutate,
    status: () => readCheckStatus(pi, ctx),
    close: () => rmSync(cwd, { recursive: true, force: true }),
  };
}

test('never registers a continuation hook when checks are missing or fail', (t) => {
  const run = register({ lint: 'eslint .', test: 'node --test' });
  t.after(run.close);
  run.mutate();
  run.check('npm run test', true);
  assert.equal(run.status()?.green, false);
  for (const event of ['turn_start', 'turn_end', 'agent_before_settle', 'agent_settled']) {
    assert.equal(run.handlers.has(event), false, event);
  }
});

test('shares green checks with review and invalidates them only after successful mutations', (t) => {
  const run = register();
  t.after(run.close);
  assert.deepEqual(run.status(), { command: 'npm run check', green: false });
  run.check('npm run check');
  assert.equal(run.status()?.green, true);
  run.mutate(true);
  assert.equal(run.status()?.green, true);
  run.mutate();
  assert.equal(run.status()?.green, false);
});

test('a failed rerun clears the observed green result', (t) => {
  const run = register();
  t.after(run.close);
  run.check('npm run check');
  run.check('npm run check', true);
  assert.equal(run.status()?.green, false);
});

test('unrecognised shell forms stay unconfirmed without arming a gate', (t) => {
  const run = register();
  t.after(run.close);
  for (const command of [
    'npm run check | tail -20',
    'npm run check; echo "exit=$?"',
    'npm run check > /tmp/check.log 2>&1; status=$?; exit "$status"',
  ]) {
    run.check(command);
    assert.equal(run.status()?.green, false);
  }
  assert.equal(run.handlers.has('agent_before_settle'), false);
});

test('only idle user input and session start reset observations', (t) => {
  const run = register();
  t.after(run.close);
  for (const event of [
    { source: 'interactive', streamingBehavior: 'steer' },
    { source: 'rpc', streamingBehavior: 'followUp' },
    { source: 'extension' },
  ]) {
    run.check('npm run check');
    run.emit('input', event);
    assert.equal(run.status()?.green, true);
  }
  for (const source of ['interactive', 'rpc']) {
    run.emit('input', { source });
    assert.equal(run.status()?.green, false);
    run.check('npm run check');
  }
  run.emit('session_start', {});
  assert.equal(run.status()?.green, false);
});

test('no detected command means no status and no continuation', (t) => {
  const run = register({});
  t.after(run.close);
  run.mutate();
  run.check('npm run check');
  assert.equal(run.status(), undefined);
  assert.equal(run.handlers.has('agent_before_settle'), false);
});
