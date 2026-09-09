import { type Static, Type } from 'typebox';
import { Check } from 'typebox/value';

export const TOOL_NAME = 'sideroom_todo';
export const UI_UNAVAILABLE =
  'Error: UI not available (running in non-interactive mode)';
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

const TodoItemSchema = Type.Object({
  id: Type.String({ description: 'Stable identifier for this item' }),
  content: Type.String({ description: 'Short description of the work' }),
  status: TodoStatusSchema,
});

const TodoPatchSchema = Type.Object({
  id: Type.String({ description: 'Identifier of the item to patch' }),
  status: Type.Optional(TodoStatusSchema),
  content: Type.Optional(
    Type.String({ description: 'Replacement work description' }),
  ),
});

const ProposeParamsSchema = Type.Object({
  action: Type.Literal(TODO_ACTION.propose),
  items: Type.Array(TodoItemSchema, {
    maxItems: MAX_TODO_ITEMS,
    description: 'Replacement board, with at most 20 items',
  }),
});

const UpdateParamsSchema = Type.Object({
  action: Type.Literal(TODO_ACTION.update),
  patches: Type.Array(TodoPatchSchema, {
    minItems: 1,
    description: 'Patches to apply together',
  }),
});

export const TodoParamsSchema = Type.Union([
  ProposeParamsSchema,
  UpdateParamsSchema,
]);

export type TodoParams = Static<typeof TodoParamsSchema>;
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

export interface TodoGuardState {
  readonly items: readonly TodoItem[];
  readonly turnMutated: boolean;
  readonly turnCalledTodo: boolean;
  readonly proposeNudgedThisRun: boolean;
  readonly updateWatchdogThisTurn: boolean;
  readonly steerFromUs: boolean;
}

const STATUS_MARKS: Readonly<Record<TodoStatus, string>> = {
  [TODO_STATUS.pending]: '-',
  [TODO_STATUS.inProgress]: '>',
  [TODO_STATUS.completed]: '✓',
  [TODO_STATUS.cancelled]: '~',
};

const BOARD_INSTRUCTIONS =
  'Call sideroom_todo update before the next item. While any item is pending, exactly one must be in_progress. Complete the current item and start the next in the same update. propose replaces the list; update patches by id.';

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

export function prepareTodoArguments(args: unknown): TodoParams {
  return decodeTodoWireArgs(args) as TodoParams;
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
    return { ok: false, message: 'Error: Invalid sideroom_todo parameters' };
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
      return { ok: false, message: `Error: Unknown todo id: ${id}` };
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

export function shouldNudgePropose(state: TodoGuardState): boolean {
  return (
    state.turnMutated &&
    state.items.length === 0 &&
    !state.proposeNudgedThisRun &&
    !state.steerFromUs
  );
}

export function shouldWatchdogUpdate(state: TodoGuardState): boolean {
  return (
    state.turnMutated &&
    state.items.length > 0 &&
    !state.turnCalledTodo &&
    !state.updateWatchdogThisTurn &&
    !state.steerFromUs
  );
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
      return { ok: false, message: `Error: Duplicate todo id: ${id.value}` };
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
        message: `Error: Duplicate todo patch id: ${id.value}`,
      };
    }
    seen.add(id.value);
    if (patch.status === undefined && patch.content === undefined) {
      return {
        ok: false,
        message: `Error: Todo patch '${id.value}' must change status or content`,
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
      message: `Error: Todo id must contain 1 to ${String(MAX_TODO_ID_LENGTH)} characters`,
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
      message: `Error: Todo content must contain 1 to ${String(MAX_TODO_CONTENT_LENGTH)} characters`,
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
    return 'Error: At most one todo item may be in_progress';
  }
  if (pendingCount > 0 && inProgressCount !== 1) {
    return 'Error: A board with pending items must have exactly one in_progress item';
  }
  return undefined;
}
