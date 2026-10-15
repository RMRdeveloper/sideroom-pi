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
  PROJECT_BINDINGS,
  parseSelection,
  SelectionSchema,
  SOURCE_METHOD,
  selectionContext,
  VISUAL_SNAPSHOT,
  type VisualSelection,
} from './model.ts';
import { inspectProject } from './projects.ts';
import { currentCandidates, resolveProjectSelection } from './source.ts';

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
    method: Type.Optional(Type.Literal('compiler')),
    startColumn: Type.Optional(Type.Integer({ minimum: 1 })),
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
              issue: Type.Optional(Type.String({ maxLength: 512 })),
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
  bindings: readonly ProjectBinding[];
}

interface ProjectBinding {
  readonly origin: string;
  readonly project: string;
}
const BindingsSchema = Type.Object(
  {
    bindings: Type.Array(
      Type.Object(
        {
          origin: Type.String({ maxLength: 2_048 }),
          project: Type.String({
            minLength: 1,
            maxLength: 2_048,
            pattern: '^[^\\x00-\\x1f\\x7f]*$',
          }),
        },
        { additionalProperties: false },
      ),
      { maxItems: 64 },
    ),
  },
  { additionalProperties: false },
);

function pageOrigin(page: string): string {
  let url: URL;
  try {
    url = new URL(page);
  } catch (cause) {
    throw new Error('Invalid browser page address for project association.', {
      cause,
    });
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Associate an HTTP or HTTPS page.');
  }
  return url.origin;
}

function projectFor(store: VisualStore, page: string): string | undefined {
  return store.bindings.find((binding) => binding.origin === pageOrigin(page))
    ?.project;
}

export function createVisualStore(): VisualStore {
  return { pending: [], bindings: [] };
}

interface ProjectBindingInput {
  readonly store: VisualStore;
  readonly pi: Pick<ExtensionAPI, 'appendEntry'>;
  readonly cwd: string;
  readonly project: string;
  readonly page: string;
}

export function bindProject({
  store,
  pi,
  cwd,
  project,
  page,
}: ProjectBindingInput): void {
  const inspected = inspectProject(cwd, project);
  const origin = pageOrigin(page);
  const bindings = [
    ...store.bindings.filter((binding) => binding.origin !== origin),
    { origin, project: inspected.path },
  ];
  if (bindings.length > 64) {
    throw new Error(
      'The session already has 64 project associations. Reuse an existing origin.',
    );
  }
  const pending = store.pending.map((entry) => {
    if (pageOrigin(entry.selection.page) !== origin) {
      return entry;
    }
    const resolution = resolveProjectSelection({
      cwd,
      selection: entry.selection,
      project: inspected.path,
    });
    return {
      selection: entry.selection,
      resolution,
      chosen: resolution.candidates.find(
        (candidate) => candidate.method === SOURCE_METHOD.compiler,
      ),
    };
  });
  store.bindings = bindings;
  pi.appendEntry(PROJECT_BINDINGS, { bindings });
  commitPending({ store, pi, pending });
}

interface PendingCommit {
  readonly store: VisualStore;
  readonly pi: Pick<ExtensionAPI, 'appendEntry'>;
  readonly pending: readonly PendingSelection[];
}

export function commitPending({ store, pi, pending }: PendingCommit): void {
  store.pending = pending;
  pi.appendEntry(VISUAL_SNAPSHOT, { pending });
}

interface ReceiveSelectionInput {
  readonly store: VisualStore;
  readonly pi: Pick<ExtensionAPI, 'appendEntry'>;
  readonly cwd: string;
  readonly selection: VisualSelection;
}

export function receiveSelection({
  store,
  pi,
  cwd,
  selection,
}: ReceiveSelectionInput): { readonly candidates: number } {
  const existing = store.pending.find(
    (entry) => entry.selection.id === selection.id,
  );
  if (existing) {
    return { candidates: existing.resolution.candidates.length };
  }
  assertSelectionCapacity(store.pending);
  const resolution = resolveProjectSelection({
    cwd,
    selection,
    project: projectFor(store, selection.page),
  });
  commitPending({
    store,
    pi,
    pending: addSelection(store.pending, {
      selection,
      resolution,
      chosen: resolution.candidates.find(
        (candidate) => candidate.method === SOURCE_METHOD.compiler,
      ),
    }),
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
  store.bindings = [];
  const branch = ctx.sessionManager.getBranch();
  for (const entry of [...branch].reverse()) {
    if (entry.type !== 'custom' || entry.customType !== PROJECT_BINDINGS) {
      continue;
    }
    if (Check(BindingsSchema, entry.data)) {
      store.bindings = entry.data.bindings.map((binding) => ({
        ...binding,
        origin: pageOrigin(binding.origin),
      }));
    }
    break;
  }
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const entry = branch[index];
    if (entry?.type !== 'custom' || entry.customType !== VISUAL_SNAPSHOT) {
      continue;
    }
    if (!Check(SnapshotSchema, entry.data)) {
      return;
    }
    const snapshot: Static<typeof SnapshotSchema> = entry.data;
    const current = new Set(
      currentCandidates(
        ctx.cwd,
        snapshot.pending.flatMap((pending) => pending.resolution.candidates),
      ),
    );
    store.pending = snapshot.pending.flatMap((pending) => {
      const candidates = pending.resolution.candidates.filter(
        (candidate) =>
          candidate.startLine <= candidate.endLine && current.has(candidate),
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
  const current = new Set(
    currentCandidates(
      cwd,
      store.pending.flatMap((entry) => entry.resolution.candidates),
    ),
  );
  const pending = store.pending.map((entry) => {
    const candidates = entry.resolution.candidates.filter((candidate) =>
      current.has(candidate),
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
