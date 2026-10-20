import { randomUUID } from 'node:crypto';
import {
  type ExtensionAPI,
  type ExtensionContext,
  getAgentDir,
} from '@earendil-works/pi-coding-agent';
import { connectSession, type VisualBridge } from './bridge.ts';
import {
  chooseProject,
  chooseSourceAction,
  chooseVisualAction,
} from './dialogs.ts';
import {
  cleanLabel,
  type PendingSelection,
  type SessionDescriptor,
  VISUAL_SHORTCUT,
  VISUAL_WIDGET,
} from './model.ts';
import { ensurePairing, pairingAddress, readPairing } from './pairing.ts';
import { discoverProjects } from './projects.ts';
import {
  bindProject,
  commitPending,
  createVisualStore,
  prepareContext,
  receiveSelection,
  restorePending,
} from './session.ts';
import { registerVisualSetup } from './setup.ts';
import { candidateIsCurrent } from './source.ts';
import { BROWSER_EXTENSION_DIRECTORY, refreshVisualWidget } from './ui.ts';

function notifyRestoreFailure(ctx: ExtensionContext, cause: unknown): void {
  ctx.ui.notify(`Cannot restore browser context: ${String(cause)}`, 'error');
}

export default function registerVisualContext(
  pi: ExtensionAPI,
  agentDirectory = getAgentDir(),
): void {
  const store = createVisualStore();
  registerVisualSetup(pi, ({ project, page, cwd }) => {
    bindProject({ store, pi, cwd, project, page });
    if (activeContext) {
      refreshVisualWidget(store.pending, activeContext);
    }
  });
  let bridge: VisualBridge | undefined;
  let activeContext: ExtensionContext | undefined;
  let opening = false;
  let generation = 0;
  let preparedContext: ReturnType<typeof prepareContext>;
  const instanceId = randomUUID();
  let destination: SessionDescriptor | undefined;

  async function stopBridge(): Promise<void> {
    generation += 1;
    preparedContext = undefined;
    const previous = bridge;
    bridge = undefined;
    await previous?.close();
  }

  const refresh = (ctx: ExtensionContext): void =>
    refreshVisualWidget(store.pending, ctx);
  const savePending = (
    ctx: ExtensionContext,
    pending: readonly PendingSelection[],
  ): void => {
    commitPending({ store, pi, pending });
    refresh(ctx);
  };

  const dialogIsCurrent = (ctx: ExtensionContext, epoch: number): boolean =>
    epoch === generation && activeContext === ctx;
  async function activate(ctx: ExtensionContext): Promise<void> {
    generation += 1;
    preparedContext = undefined;
    activeContext = ctx;
    if (ctx.mode !== 'tui') {
      await stopBridge();
      return;
    }
    destination = {
      id: instanceId,
      revision: randomUUID(),
      name: cleanLabel(
        ctx.sessionManager.getSessionName() ??
          ctx.sessionManager.getSessionId(),
        160,
      ),
      project: cleanLabel(ctx.cwd, 512),
      environment:
        process.platform === 'win32'
          ? 'Windows'
          : process.env.WSL_DISTRO_NAME
            ? `WSL (${cleanLabel(process.env.WSL_DISTRO_NAME, 140)})`
            : process.platform,
    };
    restorePending({ store, ctx });
    refresh(ctx);
    if (!ctx.isProjectTrusted()) {
      await stopBridge();
      return;
    }
    bridge?.update(destination);
    if (!bridge) {
      const identity = readPairing(agentDirectory);
      if (identity) {
        await openBridge(identity);
      }
    }
  }
  async function openBridge(
    identity: Awaited<ReturnType<typeof ensurePairing>>,
  ): Promise<void> {
    if (!destination) {
      throw new Error('The Pi conversation is not available.');
    }
    const captured = generation;
    const created = await connectSession({
      identity,
      session: destination,
      onSelection: (selection, revision) => {
        const current = activeContext;
        if (
          !current?.isProjectTrusted() ||
          destination?.revision !== revision
        ) {
          throw new Error('The destination Pi session is no longer trusted.');
        }
        const receipt = receiveSelection({
          store,
          pi,
          cwd: current.cwd,
          selection,
        });
        refresh(current);
        return receipt;
      },
      onError: (error) => activeContext?.ui.notify(error.message, 'error'),
    });
    const current = activeContext;
    if (!current || !dialogIsCurrent(current, captured)) {
      await created.close();
      return;
    }
    bridge = created;
  }
  const activateSafely = async (ctx: ExtensionContext): Promise<void> => {
    try {
      await activate(ctx);
    } catch (cause) {
      notifyRestoreFailure(ctx, cause);
    }
  };
  pi.on('session_start', (_event, ctx) => activateSafely(ctx));
  pi.on('session_tree', (_event, ctx) => activateSafely(ctx));
  pi.on('session_compact', (_event, ctx) => {
    activeContext = ctx;
    try {
      restorePending({ store, ctx });
    } catch (cause) {
      notifyRestoreFailure(ctx, cause);
    }
    refresh(ctx);
  });
  pi.on('session_shutdown', async (_event, ctx) => {
    activeContext = undefined;
    await stopBridge();
    ctx.ui.setWidget(VISUAL_WIDGET, undefined);
  });
  pi.on('input', (event, ctx) => {
    if (
      event.source !== 'interactive' ||
      !ctx.isIdle() ||
      event.streamingBehavior !== undefined ||
      /^[!/]/u.test(event.text.trimStart())
    ) {
      return;
    }
    const context = prepareContext({ store, cwd: ctx.cwd });
    if (context === undefined) {
      return;
    }
    preparedContext = context;
    return {
      action: 'transform',
      text: `${event.text}\n\n${context.text}`,
      images: event.images,
    };
  });

  pi.on('before_agent_start', (event, ctx) => {
    const attachment = preparedContext;
    preparedContext = undefined;
    if (
      !attachment ||
      event.messageType === 'custom' ||
      !event.prompt.includes(attachment.text)
    ) {
      return;
    }
    savePending(
      ctx,
      store.pending.filter(
        (entry) => !attachment.selectionIds.includes(entry.selection.id),
      ),
    );
  });
  pi.registerShortcut(VISUAL_SHORTCUT, {
    description: 'Pair the browser or review selected elements',
    handler: async (ctx) => {
      if (opening || ctx.mode !== 'tui') {
        return;
      }
      if (!ctx.isProjectTrusted()) {
        ctx.ui.notify(
          'Trust this project in Pi before connecting the browser.',
          'warning',
        );
        return;
      }
      opening = true;
      try {
        if (!destination || activeContext !== ctx) {
          await activate(ctx);
        }
        const dialogGeneration = generation;
        const picked = await chooseVisualAction({
          ui: ctx.ui,
          pending: store.pending,
          connected: bridge !== undefined,
        });
        if (!dialogIsCurrent(ctx, dialogGeneration) || !picked) {
          return;
        }
        if (picked.action === 'pair') {
          const identity = await ensurePairing(agentDirectory);
          if (!bridge) {
            await openBridge(identity);
          }
          if (!dialogIsCurrent(ctx, dialogGeneration)) {
            return;
          }
          ctx.ui.notify(
            `Load the browser extension from ${BROWSER_EXTENSION_DIRECTORY}. Pair once with this address: ${pairingAddress(identity)}. The browser reconnects to future sessions automatically.`,
            'info',
          );
          await ctx.ui.editor(
            'Pairing address — copy into the Sideroom browser extension',
            pairingAddress(identity),
          );
          return;
        }
        if (picked.action === 'stop') {
          await stopBridge();
          ctx.ui.notify(
            'This session stopped receiving browser elements. Other Pi instances remain available. Pending elements are preserved.',
            'info',
          );
          return;
        }
        if (picked.action === 'clear') {
          savePending(ctx, []);
          return;
        }
        const entry = picked.entry;
        const selected = await chooseSourceAction(ctx.ui, entry);
        if (!dialogIsCurrent(ctx, dialogGeneration) || !selected) {
          return;
        }
        if (selected.action === 'associate') {
          const project = await chooseProject(
            ctx.ui,
            discoverProjects(ctx.cwd),
          );
          if (!dialogIsCurrent(ctx, dialogGeneration)) {
            return;
          }
          if (project) {
            bindProject({
              store,
              pi,
              cwd: ctx.cwd,
              project: project.path,
              page: entry.selection.page,
            });
            refresh(ctx);
          }
          return;
        }
        const candidate =
          selected.action === 'choose' ? selected.candidate : undefined;
        if (candidate && !candidateIsCurrent(ctx.cwd, candidate)) {
          ctx.ui.notify(
            'The source changed. Select the element again in your browser.',
            'warning',
          );
          return;
        }
        const pending =
          selected.action === 'remove'
            ? store.pending.filter(
              (item) => item.selection.id !== entry.selection.id,
            )
            : store.pending.map((item) =>
              item.selection.id === entry.selection.id
                ? { ...item, chosen: candidate }
                : item,
            );
        savePending(ctx, pending);
      } finally {
        opening = false;
      }
    },
  });
}
