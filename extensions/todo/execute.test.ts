import assert from 'node:assert/strict';
import test from 'node:test';
import { executeTodo } from './execute.ts';
import { type TodoItem, type TodoParams, UI_UNAVAILABLE } from './model.ts';

const initialItems: readonly TodoItem[] = [
  { id: 'auth', content: 'Add login route', status: 'in_progress' },
  { id: 'tests', content: 'Cover login', status: 'pending' },
];

function propose(items: readonly TodoItem[]): TodoParams {
  return { action: 'propose', items: [...items] };
}

test('prepares propose only in the TUI, and update works headlessly', () => {
  const rejected = executeTodo(propose(initialItems), { mode: 'print' }, []);
  assert.equal(rejected.details.error, UI_UNAVAILABLE);

  const proposed = executeTodo(propose(initialItems), { mode: 'tui' }, []);
  assert.equal(proposed.details.error, undefined);
  assert.deepEqual(proposed.details.items, initialItems);

  const updated = executeTodo(
    {
      action: 'update',
      patches: [
        { id: 'auth', status: 'completed' },
        { id: 'tests', status: 'in_progress' },
      ],
    },
    { mode: 'print' },
    proposed.details.items,
  );
  assert.equal(updated.details.error, undefined);
  assert.deepEqual(updated.details.items, [
    { id: 'auth', content: 'Add login route', status: 'completed' },
    { id: 'tests', content: 'Cover login', status: 'in_progress' },
  ]);
});

test('confirms what changed on the board', () => {
  const proposed = executeTodo(propose(initialItems), { mode: 'tui' }, []);
  assert.equal(proposed.content[0]?.text, 'Board proposed: 2 items.');

  const updated = executeTodo(
    {
      action: 'update',
      patches: [
        { id: 'auth', status: 'completed' },
        { id: 'tests', status: 'in_progress' },
      ],
    },
    { mode: 'print' },
    proposed.details.items,
  );
  assert.equal(updated.content[0]?.text, 'Board updated: 2 items.');

  const cleared = executeTodo(propose([]), { mode: 'tui' }, []);
  assert.equal(cleared.content[0]?.text, 'Board cleared: no items left.');
});
