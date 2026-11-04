import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
import { formatMissingTestNotice, MISSING_TEST_NOTICE_TYPE } from './model.ts';

type EventHandler = (event: never, ctx: ExtensionContext) => unknown;

const SETTLE_SUPPLEMENT_EVENT = 'sideroom:settle-supplement';

const SOURCE_PATH = 'src/app.ts';

const TEST_PATH = 'src/app.test.ts';

const TESTED_SCRIPTS: Record<string, string> = { check: 'x', test: 'node --test' };

interface SettleSupplement {
  readonly customType: string;
  readonly content: string;
}

function register(scripts: Record<string, string> = { check: 'x' }) {
  const handlers = new Map<string, EventHandler>();
  const events = createEventBus();
  const pi = {
    on(name: string, handler: EventHandler) {
      const existing = handlers.get(name);
      if (existing === undefined) {
        handlers.set(name, handler);
        return;
      }
      handlers.set(name, ((event: never, local: ExtensionContext) => {
        existing(event, local);
        return handler(event, local);
      }) as EventHandler);
    },
    events,
    sendMessage() {
      assert.fail('check observation must never send a message');
    },
  } as unknown as ExtensionAPI;
  const cwd = mkdtempSync(join(tmpdir(), 'sideroom-done-'));
  const ctx = { cwd } as ExtensionContext;
  writePackageScripts(scripts);
  registerDone(pi);

  function writePackageScripts(next: Record<string, string>): void {
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ scripts: next }));
  }
  function emit(name: string, event: unknown, directory = cwd): unknown {
    const handler = handlers.get(name);
    assert.ok(handler, name);
    return handler(event as never, { cwd: directory } as ExtensionContext);
  }
  function check(command: string, isError = false): void {
    emit('tool_call', { toolName: 'bash', toolCallId: 'check', input: { command } });
    emit('tool_result', { toolName: 'bash', toolCallId: 'check', isError });
  }
  function writePath(path: string, isError = false): void {
    emit('tool_call', { toolName: 'write', toolCallId: 'write', input: { path } });
    emit('tool_result', { toolName: 'write', toolCallId: 'write', isError });
  }
  function editPath(path: string, isError = false): void {
    emit('tool_call', { toolName: 'edit', toolCallId: 'edit', input: { path } });
    emit('tool_result', { toolName: 'edit', toolCallId: 'edit', isError });
  }
  function mutate(isError = false): void {
    writePath(SOURCE_PATH, isError);
  }
  function supplement(): SettleSupplement[] {
    const request: {
      readonly ctx: ExtensionContext;
      readonly messages: SettleSupplement[];
    } = { ctx, messages: [] };
    events.emit(SETTLE_SUPPLEMENT_EVENT, request);
    return request.messages;
  }
  return {
    handlers,
    emit,
    check,
    mutate,
    writePath,
    editPath,
    writePackageScripts,
    supplement,
    cwd,
    status: () => readCheckStatus(pi, ctx),
    statusIn: (directory: string) =>
      readCheckStatus(pi, { cwd: directory } as ExtensionContext),
    checkIn(directory: string, command: string, isError = false): void {
      const id = `check-${directory}`;
      emit('tool_call', {
        toolName: 'bash',
        toolCallId: id,
        input: { command },
      }, directory);
      emit('tool_result', {
        toolName: 'bash',
        toolCallId: id,
        isError,
      }, directory);
    },
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
  assert.deepEqual(run.status(), {
    command: 'npm run check',
    green: false,
    outcome: 'not-run',
  });
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

test('a check that overlaps a file change does not turn green', (t) => {
  const run = register();
  t.after(run.close);
  run.emit('tool_call', {
    toolName: 'bash',
    toolCallId: 'overlap',
    input: { command: 'npm run check' },
  });
  run.mutate();
  run.emit('tool_result', {
    toolName: 'bash',
    toolCallId: 'overlap',
    isError: false,
  });
  assert.equal(run.status()?.green, false);
});

test('another directory, a help flag, or a following command does not turn green', (t) => {
  const run = register();
  t.after(run.close);
  for (const command of [
    'cd site && npm run check',
    'npm run check -- --help',
    'npm run check\ntrue',
  ]) {
    run.check(command);
    assert.equal(run.status()?.green, false, command);
  }
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

test('ignores tool calls that are not write, edit or bash', (t) => {
  const run = register();
  t.after(run.close);
  run.emit('tool_call', {
    toolName: 'read',
    toolCallId: 'read',
    input: { path: SOURCE_PATH },
  });
  assert.equal(run.status()?.green, false);
});

test('adds the missing-test notice once after a successful code change', (t) => {
  const run = register(TESTED_SCRIPTS);
  t.after(run.close);
  run.mutate();
  assert.deepEqual(run.supplement(), [
    { customType: MISSING_TEST_NOTICE_TYPE, content: formatMissingTestNotice() },
  ]);
  assert.deepEqual(run.supplement(), []);
});

test('counts an edit of a source file as a code change', (t) => {
  const run = register(TESTED_SCRIPTS);
  t.after(run.close);
  run.editPath(SOURCE_PATH);
  assert.equal(run.supplement().length, 1);
});

test('stays silent when the run changed a test file', (t) => {
  const run = register(TESTED_SCRIPTS);
  t.after(run.close);
  run.writePath(TEST_PATH);
  assert.deepEqual(run.supplement(), []);
});

test('stays silent when the run changed only documentation', (t) => {
  const run = register(TESTED_SCRIPTS);
  t.after(run.close);
  run.writePath('README.md');
  assert.deepEqual(run.supplement(), []);
});

test('keeps a run that changed a test file out of the missing-test notice', (t) => {
  const run = register(TESTED_SCRIPTS);
  t.after(run.close);
  run.writePath(TEST_PATH);
  run.writePath(SOURCE_PATH);
  assert.deepEqual(run.supplement(), []);
});

test('keeps the first detected test setup for the working directory', (t) => {
  const run = register(TESTED_SCRIPTS);
  t.after(run.close);
  assert.deepEqual(run.supplement(), []);
  run.writePackageScripts({ check: 'x' });
  run.mutate();
  assert.equal(run.supplement().length, 1);
});

test('keeps an unobserved disk edit out of the detected command', (t) => {
  const run = register({});
  t.after(run.close);
  assert.equal(run.status(), undefined);
  run.writePackageScripts({ check: 'eslint .' });
  assert.equal(run.status(), undefined);
});

test('refreshes the detected command after an observed manifest edit', (t) => {
  const run = register({});
  t.after(run.close);
  assert.equal(run.status(), undefined);
  run.writePackageScripts({ check: 'eslint .' });
  run.writePath('package.json');
  assert.equal(run.status()?.command, 'npm run check');
  assert.equal(run.status()?.green, false);
});

test('refreshes whether tests exist after an observed manifest edit', (t) => {
  const run = register(TESTED_SCRIPTS);
  t.after(run.close);
  assert.deepEqual(run.supplement(), []);
  run.writePackageScripts({ check: 'x' });
  run.writePath('package.json');
  run.mutate();
  assert.deepEqual(run.supplement(), []);
});

test('a child project check does not turn the root green', (t) => {
  const run = register();
  t.after(run.close);
  const site = join(run.cwd, 'site');
  const other = join(run.cwd, 'other');
  mkdirSync(site);
  mkdirSync(other);
  writeFileSync(
    join(site, 'package.json'),
    JSON.stringify({ scripts: { check: 'true' } }),
  );
  writeFileSync(
    join(other, 'package.json'),
    JSON.stringify({ scripts: { check: 'true' } }),
  );
  run.check('cd site && npm run check');
  run.check('cd other && npm run check');
  assert.equal(run.status()?.green, false);
  run.checkIn(site, 'npm run check');
  run.checkIn(other, 'npm run check');
  assert.equal(run.status()?.green, false);
  assert.equal(run.statusIn(site)?.green, true);
  assert.equal(run.statusIn(other)?.green, true);
});

test('a broken manifest reports unknown and does not block the command', (t) => {
  const run = register();
  t.after(run.close);
  writeFileSync(join(run.cwd, 'package.json'), '{');
  const blocked = run.emit('tool_call', {
    toolName: 'bash',
    toolCallId: 'broken',
    input: { command: 'npm run check' },
  });
  assert.equal(blocked, undefined);
  assert.deepEqual(run.status(), {
    command: undefined,
    green: false,
    outcome: 'unknown',
  });
});

test('a check started after the latest edit can turn green', (t) => {
  const run = register();
  t.after(run.close);
  run.mutate();
  run.check('npm run check');
  assert.equal(run.status()?.green, true);
  assert.equal(run.status()?.outcome, 'passed');
});
