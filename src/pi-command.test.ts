import assert from 'node:assert/strict';
import test from 'node:test';

import { formatPiCommandHelp, parsePiCommand } from './pi-command.ts';

test('parses a quoted Pi request with supported options', () => {
  assert.deepEqual(
    parsePiCommand('--max-fix-passes 3 --read-only "Add retry handling"'),
    {
      kind: 'run',
      request: 'Add retry handling',
      maxFixPasses: 3,
      allowWrite: false,
    },
  );
});

test('rejects the removed language option and omits it from help', () => {
  assert.deepEqual(parsePiCommand('--language python'), {
    kind: 'error',
    message: 'unknown option: --language',
  });
  assert.doesNotMatch(formatPiCommandHelp(), /--language/);
});

test('rejects malformed Pi command options', () => {
  assert.deepEqual(parsePiCommand('"unfinished'), {
    kind: 'error',
    message: 'command arguments contain an unterminated quote',
  });
});
