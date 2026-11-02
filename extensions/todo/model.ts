import { type Static, Type } from 'typebox';
import { Check } from 'typebox/value';

export const TOOL_NAME = 'sideroom_todo';
export const UI_UNAVAILABLE =
  'Error: A board proposal needs the interactive window, and this run has none. Use update to change individual items, or run Pi in the TUI.';
export const TODO_ACTION = {
  propose: 'propose',
  update: 'update',
} as const;
export const TODO_STATUS = {
  pending: 'pending',
  inProgress: 'in_progress',
  completed: 'completed',
  cancelled: 'cancelled',
} as const;

const MAX_TODO_ITEMS = 20;
const MAX_TODO_ID_LENGTH = 32;
const MAX_TODO_CONTENT_LENGTH = 200;
const STATUS_COLUMN_WIDTH = 12;

const TodoStatusSchema = Type.Union([
  Type.Literal(TODO_STATUS.pending),
  Type.Literal(TODO_STATUS.inProgress),
  Type.Literal(TODO_STATUS.completed),
  Type.Literal(TODO_STATUS.cancelled),
]);

const TodoActionSchema = Type.Union([
  Type.Literal(TODO_ACTION.propose),
  Type.Literal(TODO_ACTION.update),
]);

const TodoItemSchema = Type.Object({
  id: Type.String({
    description: 'Short stable id for this item, for example auth',
  }),
  content: Type.String({
    description: 'What this task will do, in everyday words',
  }),
  status: TodoStatusSchema,
});

const TodoPatchSchema = Type.Object({
  id: Type.String({ description: 'Id of the item to change' }),
  status: Type.Optional(TodoStatusSchema),
  content: Type.Optional(
    Type.String({ description: 'New wording for the task, replacing the old one' }),
  ),
});

const TodoItemsField = Type.Array(TodoItemSchema, {
  maxItems: MAX_TODO_ITEMS,
  description: `Full board for propose, at most ${String(MAX_TODO_ITEMS)} items`,
});

const TodoPatchesField = Type.Array(TodoPatchSchema, {
  minItems: 1,
  description: 'Changes to apply for update, one per item id',
});

const ProposeParamsSchema = Type.Object({
  action: Type.Literal(TODO_ACTION.propose),
  items: TodoItemsField,
});

const UpdateParamsSchema = Type.Object({
  action: Type.Literal(TODO_ACTION.update),
  patches: TodoPatchesField,
});

export const TodoParamsSchema = Type.Union([
  ProposeParamsSchema,
  UpdateParamsSchema,
]);

export const TodoToolParametersSchema = Type.Object({
  action: TodoActionSchema,
  items: Type.Optional(TodoItemsField),
  patches: Type.Optional(TodoPatchesField),
});

export type TodoParams = Static<typeof TodoParamsSchema>;
export type TodoToolParameters = Static<typeof TodoToolParametersSchema>;
export type TodoAction = (typeof TODO_ACTION)[keyof typeof TODO_ACTION];
export type TodoStatus = (typeof TODO_STATUS)[keyof typeof TODO_STATUS];

export interface TodoItem {
  readonly id: string;
  readonly content: string;
  readonly status: TodoStatus;
}

export interface TodoPatch {
  readonly id: string;
  readonly status?: TodoStatus;
  readonly content?: string;
}

export type ParsedTodoParams =
  | {
    readonly action: typeof TODO_ACTION.propose;
    readonly items: readonly TodoItem[];
  }
  | {
    readonly action: typeof TODO_ACTION.update;
    readonly patches: readonly TodoPatch[];
  };

export type ParseTodoResult =
  | { readonly ok: true; readonly params: ParsedTodoParams }
  | { readonly ok: false; readonly message: string };

export type ApplyTodoResult =
  | { readonly ok: true; readonly items: readonly TodoItem[] }
  | { readonly ok: false; readonly message: string };

const STATUS_MARKS: Readonly<Record<TodoStatus, string>> = {
  [TODO_STATUS.pending]: '-',
  [TODO_STATUS.inProgress]: '>',
  [TODO_STATUS.completed]: '✓',
  [TODO_STATUS.cancelled]: '~',
};

const BOARD_INSTRUCTIONS =
  'Keep the board current: call sideroom_todo update when an item changes status, and mark the finished item while starting the next one in the same call. While any item is pending, exactly one item is in_progress. propose replaces the whole board; update changes items by id.';

const SCHEMA_FALLBACK = `Error: The sideroom_todo call does not match the schema. Send action "propose" with items (at most ${String(MAX_TODO_ITEMS)}), or action "update" with patches.`;

interface JsonWireObject {
  readonly [key: string]: JsonWireValue | undefined;
}

type JsonWireValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonWireValue[]
  | JsonWireObject;

export function prepareTodoArguments(args: unknown): TodoToolParameters {
  return decodeTodoWireArgs(args) as TodoToolParameters;
}

function decodeTodoWireArgs(args: unknown): JsonWireValue {
  if (!isJsonWireObject(args)) {
    return toJsonWireValue(args);
  }

  const items = decodeJsonWireField(args.items);
  const patches = decodeJsonWireField(args.patches);
  if (items === args.items && patches === args.patches) {
    return args;
  }

  return {
    ...args,
    ...('items' in args ? { items } : {}),
    ...('patches' in args ? { patches } : {}),
  };
}

function decodeJsonWireField(
  value: JsonWireValue | undefined,
): JsonWireValue | undefined {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value) as JsonWireValue;
  } catch {
    return value;
  }
}

function isJsonWireObject(value: unknown): value is JsonWireObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toJsonWireValue(value: unknown): JsonWireValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(toJsonWireValue);
  }
  if (isJsonWireObject(value)) {
    return value;
  }
  return null;
}

export function parseTodoParams(value: unknown): ParseTodoResult {
  const decoded = decodeTodoWireArgs(value);
  if (!Check(TodoParamsSchema, decoded)) {
    return { ok: false, message: SCHEMA_FALLBACK };
  }

  if (decoded.action === TODO_ACTION.propose) {
    const items = normalizeItems(decoded.items);
    if (!items.ok) {
      return { ok: false, message: items.message };
    }
    const invariant = validateBoard(items.items);
    if (invariant !== undefined) {
      return { ok: false, message: invariant };
    }
    return {
      ok: true,
      params: { action: TODO_ACTION.propose, items: items.items },
    };
  }

  const patches = normalizePatches(decoded.patches);
  if (!patches.ok) {
    return { ok: false, message: patches.message };
  }
  return {
    ok: true,
    params: { action: TODO_ACTION.update, patches: patches.patches },
  };
}

export function applyTodoParams(
  items: readonly TodoItem[],
  params: ParsedTodoParams,
): ApplyTodoResult {
  if (params.action === TODO_ACTION.propose) {
    return { ok: true, items: params.items };
  }

  const patchesById = new Map(params.patches.map((patch) => [patch.id, patch]));
  for (const id of patchesById.keys()) {
    if (!items.some((item) => item.id === id)) {
      return { ok: false, message: `Error: No item on the board has the id '${id}'. Use an id from the board, or propose the item first.` };
    }
  }

  const updated = items.map((item) => {
    const patch = patchesById.get(item.id);
    if (patch === undefined) {
      return item;
    }
    return {
      id: item.id,
      content: patch.content ?? item.content,
      status: patch.status ?? item.status,
    };
  });
  const invariant = validateBoard(updated);
  if (invariant !== undefined) {
    return { ok: false, message: invariant };
  }
  return { ok: true, items: updated };
}

export function formatBoardBlock(items: readonly TodoItem[]): string {
  const idWidth = Math.max(1, ...items.map((item) => item.id.length));
  const rows = items.map(
    (item) =>
      `${STATUS_MARKS[item.status]} ${item.id.padEnd(idWidth)} ${item.status.padEnd(STATUS_COLUMN_WIDTH)} ${item.content}`,
  );
  return [
    'sideroom_todo (live board; do not recap in prose)',
    ...rows,
    '',
    BOARD_INSTRUCTIONS,
  ].join('\n');
}

function normalizeItems(
  items: readonly Static<typeof TodoItemSchema>[],
):
  | { readonly ok: true; readonly items: readonly TodoItem[] }
  | { readonly ok: false; readonly message: string } {
  const seen = new Set<string>();
  const normalized: TodoItem[] = [];
  for (const item of items) {
    const id = normalizeId(item.id);
    if (!id.ok) {
      return id;
    }
    if (seen.has(id.value)) {
      return {
        ok: false,
        message: `Error: Two items use the id '${id.value}'. Give each item its own id.`,
      };
    }
    seen.add(id.value);

    const content = normalizeContent(item.content);
    if (!content.ok) {
      return content;
    }
    normalized.push({
      id: id.value,
      content: content.value,
      status: item.status,
    });
  }
  return { ok: true, items: normalized };
}

function normalizePatches(
  patches: readonly Static<typeof TodoPatchSchema>[],
):
  | { readonly ok: true; readonly patches: readonly TodoPatch[] }
  | { readonly ok: false; readonly message: string } {
  const seen = new Set<string>();
  const normalized: TodoPatch[] = [];
  for (const patch of patches) {
    const id = normalizeId(patch.id);
    if (!id.ok) {
      return id;
    }
    if (seen.has(id.value)) {
      return {
        ok: false,
        message: `Error: Two patches change the item '${id.value}'. Send one patch per item.`,
      };
    }
    seen.add(id.value);
    if (patch.status === undefined && patch.content === undefined) {
      return {
        ok: false,
        message: `Error: The patch for '${id.value}' changes nothing. Send a new status, new wording, or both.`,
      };
    }

    let content: string | undefined;
    if (patch.content !== undefined) {
      const normalizedContent = normalizeContent(patch.content);
      if (!normalizedContent.ok) {
        return normalizedContent;
      }
      content = normalizedContent.value;
    }
    normalized.push({ id: id.value, status: patch.status, content });
  }
  return { ok: true, patches: normalized };
}

function normalizeId(
  value: string,
):
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly message: string } {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > MAX_TODO_ID_LENGTH) {
    return {
      ok: false,
      message: `Error: A todo id must have 1 to ${String(MAX_TODO_ID_LENGTH)} characters. Use a short id, for example auth.`,
    };
  }
  return { ok: true, value: normalized };
}

function normalizeContent(
  value: string,
):
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly message: string } {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > MAX_TODO_CONTENT_LENGTH) {
    return {
      ok: false,
      message: `Error: A task description must have 1 to ${String(MAX_TODO_CONTENT_LENGTH)} characters. Shorten that item.`,
    };
  }
  return { ok: true, value: normalized };
}

function validateBoard(items: readonly TodoItem[]): string | undefined {
  const pendingCount = items.filter(
    (item) => item.status === TODO_STATUS.pending,
  ).length;
  const inProgressCount = items.filter(
    (item) => item.status === TODO_STATUS.inProgress,
  ).length;
  if (inProgressCount > 1) {
    return `Error: The board has ${String(inProgressCount)} items in progress and only one is allowed. Complete one in this update.`;
  }
  if (pendingCount > 0 && inProgressCount !== 1) {
    const pendingLabel =
      pendingCount === 1 ? '1 pending item' : `${String(pendingCount)} pending items`;
    return `Error: The board has ${pendingLabel} and none in progress. Mark one of them in_progress in this call.`;
  }
  return undefined;
}
