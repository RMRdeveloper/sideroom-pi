import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyTodoParams,
  formatBoardBlock,
  parseTodoParams,
  prepareTodoArguments,
  type TodoItem,
  type TodoParams,
  TodoToolParametersSchema,
} from './model.ts';

const board: readonly TodoItem[] = [
  { id: 'auth', content: 'Add login route', status: 'in_progress' },
  { id: 'tests', content: 'Cover login', status: 'pending' },
  { id: 'schema', content: 'Item types', status: 'completed' },
];

function propose(items: TodoItem[]): TodoParams {
  return { action: 'propose', items };
}

test('keeps the registered tool schema a top-level object for Claude Code', () => {
  const schema = TodoToolParametersSchema as unknown as Record<string, unknown>;
  assert.equal(schema.type, 'object');
  assert.equal('anyOf' in schema, false);
  assert.equal('oneOf' in schema, false);
  assert.equal('allOf' in schema, false);
  assert.deepEqual(Object.keys(schema.properties as object).sort(), [
    'action',
    'items',
    'patches',
  ]);
});

test('normalizes proposed ids and content while preserving caller ids and order', () => {
  const parsed = parseTodoParams(
    propose([
      {
        id: ' auth ',
        content: ' Add login route ',
        status: 'in_progress',
      },
      { id: 'tests', content: ' Cover login ', status: 'pending' },
    ]),
  );

  assert.deepEqual(parsed, {
    ok: true,
    params: {
      action: 'propose',
      items: [
        { id: 'auth', content: 'Add login route', status: 'in_progress' },
        { id: 'tests', content: 'Cover login', status: 'pending' },
      ],
    },
  });
});

test('rejects malformed boards and broken in_progress invariants', () => {
  const cases: Array<[unknown, RegExp]> = [
    [
      propose([
        { id: 'auth', content: 'Login', status: 'in_progress' },
        { id: 'auth', content: 'Tests', status: 'pending' },
      ]),
      /Two items use the id 'auth'/,
    ],
    [
      propose([{ id: ' ', content: 'Login', status: 'in_progress' }]),
      /A todo id must have 1 to 32 characters/,
    ],
    [
      propose([{ id: 'auth', content: ' ', status: 'in_progress' }]),
      /A task description must have 1 to 200 characters/,
    ],
    [
      propose([
        { id: 'one', content: 'One', status: 'in_progress' },
        { id: 'two', content: 'Two', status: 'in_progress' },
      ]),
      /items in progress and only one is allowed/,
    ],
    [
      propose([{ id: 'one', content: 'One', status: 'pending' }]),
      /none in progress/,
    ],
    [
      propose(
        Array.from({ length: 21 }, (_, index) => ({
          id: `item-${String(index)}`,
          content: 'Work',
          status: index === 0 ? ('in_progress' as const) : ('pending' as const),
        })),
      ),
      /does not match the schema/,
    ],
  ];

  for (const [params, expected] of cases) {
    const parsed = parseTodoParams(params);
    assert.equal(parsed.ok, false);
    if (!parsed.ok) {
      assert.match(parsed.message, expected);
    }
  }
});

test('applies a batch that completes the current item and starts the next', () => {
  const parsed = parseTodoParams({
    action: 'update',
    patches: [
      { id: 'auth', status: 'completed' },
      { id: 'tests', status: 'in_progress', content: 'Cover login route' },
    ],
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }

  assert.deepEqual(applyTodoParams(board, parsed.params), {
    ok: true,
    items: [
      { id: 'auth', content: 'Add login route', status: 'completed' },
      {
        id: 'tests',
        content: 'Cover login route',
        status: 'in_progress',
      },
      { id: 'schema', content: 'Item types', status: 'completed' },
    ],
  });
});

test('rejects invalid patches without partially changing the board', () => {
  const noChange = parseTodoParams({
    action: 'update',
    patches: [{ id: 'auth' }],
  });
  assert.equal(noChange.ok, false);
  if (!noChange.ok) {
    assert.match(noChange.message, /changes nothing/);
  }

  const duplicate = parseTodoParams({
    action: 'update',
    patches: [
      { id: 'auth', status: 'completed' },
      { id: 'auth', content: 'Again' },
    ],
  });
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) {
    assert.match(duplicate.message, /Two patches change the item 'auth'/);
  }

  const unknown = parseTodoParams({
    action: 'update',
    patches: [{ id: 'missing', content: 'Nope' }],
  });
  assert.equal(unknown.ok, true);
  if (unknown.ok) {
    assert.deepEqual(applyTodoParams(board, unknown.params), {
      ok: false,
      message:
        "Error: No item on the board has the id 'missing'. Use an id from the board, or propose the item first.",
    });
  }

  const brokenInvariant = parseTodoParams({
    action: 'update',
    patches: [{ id: 'auth', status: 'completed' }],
  });
  assert.equal(brokenInvariant.ok, true);
  if (brokenInvariant.ok) {
    assert.deepEqual(applyTodoParams(board, brokenInvariant.params), {
      ok: false,
      message:
        'Error: The board has 1 pending item and none in progress. Mark one of them in_progress in this call.',
    });
  }
});

test('formats the complete board and its workflow instructions', () => {
  assert.equal(
    formatBoardBlock([
      { id: 'auth', content: 'Add login route', status: 'in_progress' },
      { id: 'tests', content: 'Cover login', status: 'pending' },
      { id: 'schema', content: 'Item types', status: 'completed' },
      { id: 'extra', content: 'Optional telemetry', status: 'cancelled' },
    ]),
    [
      'sideroom_todo (live board; do not recap in prose)',
      '> auth   in_progress  Add login route',
      '- tests  pending      Cover login',
      '✓ schema completed    Item types',
      '~ extra  cancelled    Optional telemetry',
      '',
      'Keep the board current: call sideroom_todo update when an item changes status, and mark the finished item while starting the next one in the same call. While any item is pending, exactly one item is in_progress. propose replaces the whole board; update changes items by id.',
    ].join('\n'),
  );
});

test('decodes JSON-string items and patches then applies the strict schema', () => {
  const items: TodoItem[] = [
    { id: 'auth', content: 'Add login route', status: 'in_progress' },
    { id: 'tests', content: 'Cover login', status: 'pending' },
  ];
  const parsed = parseTodoParams({
    action: 'propose',
    items: JSON.stringify(items),
  });
  assert.deepEqual(parsed, {
    ok: true,
    params: { action: 'propose', items },
  });

  const nativePropose = propose(items);
  assert.equal(prepareTodoArguments(nativePropose), nativePropose);
  assert.deepEqual(
    prepareTodoArguments({
      action: 'propose',
      items: JSON.stringify(items),
    }),
    nativePropose,
  );

  const update = parseTodoParams({
    action: 'update',
    patches: JSON.stringify([
      { id: 'auth', status: 'completed' },
      { id: 'tests', status: 'in_progress' },
    ]),
  });
  assert.equal(update.ok, true);
  if (!update.ok) {
    return;
  }
  assert.deepEqual(applyTodoParams(board, update.params), {
    ok: true,
    items: [
      { id: 'auth', content: 'Add login route', status: 'completed' },
      { id: 'tests', content: 'Cover login', status: 'in_progress' },
      { id: 'schema', content: 'Item types', status: 'completed' },
    ],
  });
});

test('still rejects invalid JSON strings and decoded values that fail the schema', () => {
  const cases: unknown[] = [
    { action: 'propose' },
    { action: 'update' },
    { action: 'propose', items: '[{' },
    { action: 'propose', items: '{}' },
    { action: 'propose', items: JSON.stringify([{ id: 'auth' }]) },
    { action: 'update', patches: 'not-json' },
    {
      action: 'propose',
      items: JSON.stringify([
        { id: 'one', content: 'One', status: 'pending' },
        { id: 'two', content: 'Two', status: 'pending' },
      ]),
    },
  ];

  for (const params of cases) {
    const parsed = parseTodoParams(params);
    assert.equal(parsed.ok, false);
    if (!parsed.ok) {
      assert.match(
        parsed.message,
        /does not match the schema|none in progress/,
      );
    }
  }
});
