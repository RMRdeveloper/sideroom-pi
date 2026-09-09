import assert from 'node:assert/strict';
import test from 'node:test';
import type { TodoItem } from './model.ts';
import { reconstructTodoItems } from './session.ts';

const initialItems: readonly TodoItem[] = [
  { id: 'auth', content: 'Add login route', status: 'in_progress' },
  { id: 'tests', content: 'Cover login', status: 'pending' },
];

test('reconstructs the latest custom snapshot, including an intentionally empty board', () => {
  assert.deepEqual(
    reconstructTodoItems([
      toolResultEntry({ items: initialItems }),
      customEntry({ items: initialItems }),
      customEntry({ items: [] }),
    ] as never),
    [],
  );

  assert.deepEqual(
    reconstructTodoItems([toolResultEntry({ items: initialItems })] as never),
    initialItems,
  );
});

function customEntry(data: unknown): unknown {
  return { type: 'custom', customType: 'sideroom-todo', data };
}

function toolResultEntry(details: unknown): unknown {
  return {
    type: 'message',
    message: { role: 'toolResult', toolName: 'sideroom_todo', details },
  };
}
