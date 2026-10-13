import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { type Static, Type } from 'typebox';
import { Check } from 'typebox/value';
import {
  addSelection,
  assertSelectionCapacity,
  MAX_CANDIDATES,
  MAX_SELECTIONS,
  type PendingSelection,
  parseSelection,
  SelectionSchema,
  selectionContext,
  VISUAL_SNAPSHOT,
  type VisualSelection,
} from './model.ts';
import { candidateIsCurrent, resolveSelection } from './source.ts';

const CandidateSchema = Type.Object(
  {
    path: Type.String({
      minLength: 1,
      maxLength: 2_048,
      pattern: '^[^\\x00-\\x1f\\x7f]*$',
    }),
    startLine: Type.Integer({ minimum: 1 }),
    endLine: Type.Integer({ minimum: 1 }),
    fingerprint: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    score: Type.Integer({ minimum: 0 }),
    reasons: Type.Array(Type.String({ maxLength: 200 }), { maxItems: 40 }),
  },
  { additionalProperties: false },
);
const SnapshotSchema = Type.Object(
  {
    pending: Type.Array(
      Type.Object(
        {
          selection: SelectionSchema,
          resolution: Type.Object(
            {
              candidates: Type.Array(CandidateSchema, {
                maxItems: MAX_CANDIDATES,
              }),
              truncated: Type.Boolean(),
              capped: Type.Boolean(),
            },
            { additionalProperties: false },
          ),
          chosen: Type.Optional(CandidateSchema),
        },
        { additionalProperties: false },
      ),
      { maxItems: MAX_SELECTIONS },
    ),
  },
  { additionalProperties: false },
);

export interface VisualStore {
  pending: readonly PendingSelection[];
}

export function createVisualStore(): VisualStore {
  return { pending: [] };
}

export function commitPending({
  store,
  pi,
  pending,
}: {
  readonly store: VisualStore;
  readonly pi: Pick<ExtensionAPI, 'appendEntry'>;
  readonly pending: readonly PendingSelection[];
}): void {
  store.pending = pending;
  pi.appendEntry(VISUAL_SNAPSHOT, { pending });
}

export function receiveSelection({
  store,
  pi,
  cwd,
  selection,
}: {
  readonly store: VisualStore;
  readonly pi: Pick<ExtensionAPI, 'appendEntry'>;
  readonly cwd: string;
  readonly selection: VisualSelection;
}): { readonly candidates: number } {
  const existing = store.pending.find(
    (entry) => entry.selection.id === selection.id,
  );
  if (existing) {
    return { candidates: existing.resolution.candidates.length };
  }
  assertSelectionCapacity(store.pending);
  const resolution = resolveSelection(cwd, selection);
  commitPending({
    store,
    pi,
    pending: addSelection(store.pending, { selection, resolution }),
  });
  return { candidates: resolution.candidates.length };
}

export function restorePending({
  store,
  ctx,
}: {
  readonly store: VisualStore;
  readonly ctx: Pick<ExtensionContext, 'sessionManager' | 'cwd'>;
}): void {
  store.pending = [];
  const branch = ctx.sessionManager.getBranch();
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const entry = branch[index];
    if (entry?.type !== 'custom' || entry.customType !== VISUAL_SNAPSHOT) {
      continue;
    }
    if (!Check(SnapshotSchema, entry.data)) {
      return;
    }
    const snapshot: Static<typeof SnapshotSchema> = entry.data;
    store.pending = snapshot.pending.flatMap((pending) => {
      const candidates = pending.resolution.candidates.filter(
        (candidate) =>
          candidate.startLine <= candidate.endLine &&
          candidateIsCurrent(ctx.cwd, candidate),
      );
      let selection: VisualSelection;
      try {
        selection = parseSelection(pending.selection);
      } catch (cause) {
        throw new Error(
          'Cannot restore browser context: invalid page address in the session.',
          { cause },
        );
      }
      const chosen = candidates.find(
        (candidate) =>
          candidate.path === pending.chosen?.path &&
          candidate.startLine === pending.chosen.startLine &&
          candidate.fingerprint === pending.chosen.fingerprint,
      );
      return [
        {
          selection,
          resolution: { ...pending.resolution, candidates },
          chosen,
        },
      ];
    });
    return;
  }
}

export function prepareContext({
  store,
  cwd,
}: {
  readonly store: VisualStore;
  readonly cwd: string;
}):
  | { readonly text: string; readonly selectionIds: readonly string[] }
  | undefined {
  if (store.pending.length === 0) {
    return undefined;
  }
  const pending = store.pending.map((entry) => {
    const candidates = entry.resolution.candidates.filter((candidate) =>
      candidateIsCurrent(cwd, candidate),
    );
    const chosen =
      entry.chosen && candidates.includes(entry.chosen)
        ? entry.chosen
        : undefined;
    return {
      ...entry,
      resolution: { ...entry.resolution, candidates },
      chosen,
    };
  });
  const context = selectionContext(pending);
  return {
    text: context,
    selectionIds: pending.map((entry) => entry.selection.id),
  };
}
