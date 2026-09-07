import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  resolveCliModel,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';

import {
  buildSystemPrompt,
  getAgentDefinition,
  getPackagedSkill,
  getPackageRoot,
} from '../core/catalog.ts';
import type { FilePolicy } from '../core/language-policy.ts';
import type { ModelProvider, ModelRequest } from '../core/model.ts';

/** Minimal Pi session shape; keeping this seam avoids live model calls in tests. */
export interface PiSession {
  readonly messages: readonly unknown[];
  prompt(text: string): Promise<void>;
  abort(): Promise<void>;
  dispose(): void;
}

/** Inputs used to create one role-isolated Pi session. */
export interface PiSessionOptions {
  readonly cwd: string;
  readonly model?: string;
  readonly tools: readonly string[];
  readonly systemPrompt: string;
}

/** Factory seam for tests and applications embedding Sideroom. */
export type PiSessionFactory = (
  options: PiSessionOptions,
) => Promise<PiSession>;

/** Pi runtime configuration. This is the only executable harness today. */
export interface PiRuntimeOptions {
  readonly dir: string;
  readonly policies: readonly FilePolicy[];
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly allowWrite?: boolean;
  readonly signal?: AbortSignal;
  readonly modelRuntime?: ModelRuntime;
  readonly createSession?: PiSessionFactory;
}

const READONLY_TOOLS = ['read', 'grep', 'find', 'ls'];
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

/** Return the least-privileged Pi built-in tools appropriate for a role. */
export function piToolsFor(
  role: { readonly readonly: boolean },
  allowWrite: boolean,
  platform = process.platform,
): readonly string[] {
  if (role.readonly || !allowWrite) {
    return READONLY_TOOLS;
  }
  return [
    'read',
    platform === 'win32' ? 'powershell' : 'bash',
    'edit',
    'write',
    'grep',
    'find',
    'ls',
  ];
}

/** Build a ModelProvider backed directly by the Pi SDK, never by the Pi CLI. */
export function createPiModelProvider(
  options: PiRuntimeOptions,
): ModelProvider {
  assertTargetDirectory(options.dir);
  let runtimePromise: Promise<ModelRuntime> | undefined;
  const runtime = (): Promise<ModelRuntime> => {
    if (options.modelRuntime !== undefined) {
      return Promise.resolve(options.modelRuntime);
    }
    runtimePromise ??= ModelRuntime.create({ signal: options.signal });
    return runtimePromise;
  };
  const createSession =
    options.createSession ??
    ((sessionOptions: PiSessionOptions) =>
      createSdkSession(sessionOptions, runtime()));

  return {
    async generate<T>(request: ModelRequest): Promise<T> {
      const role = getAgentDefinition(request.agent);
      const session = await createSession({
        cwd: options.dir,
        ...(options.model === undefined ? {} : { model: options.model }),
        tools: piToolsFor(role, options.allowWrite !== false),
        systemPrompt: systemPromptFor(
          request.agent,
          role,
          options.policies,
          options.allowWrite !== false,
          options.dir,
          request.skill,
        ),
      });
      const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          void session.abort().catch(reportAbortFailure);
          reject(new Error(`Pi session timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });
      try {
        await Promise.race([
          promptWithCancellation(
            session,
            buildTaskPrompt(request),
            options.signal,
          ),
          deadline,
        ]);
        return parseJsonResponse<T>(finalPiText(session.messages));
      } finally {
        if (timeout !== undefined) {
          clearTimeout(timeout);
        }
        session.dispose();
      }
    },
  };
}

/** Fail at the boundary when the caller supplied no usable working directory. */
function assertTargetDirectory(directory: string): void {
  if (directory.trim().length === 0) {
    throw new Error('Pi needs a target directory');
  }
  try {
    if (!statSync(directory).isDirectory()) {
      throw new Error('path is not a directory');
    }
  } catch (error) {
    throw new Error(`Pi target directory is unavailable: ${directory}`, {
      cause: error,
    });
  }
}

/** Place the governing policy ahead of an explicit runtime write gate. */
function systemPromptFor(
  agent: ModelRequest['agent'],
  role: { readonly readonly: boolean },
  policies: readonly FilePolicy[],
  allowWrite: boolean,
  directory: string,
  skill: ModelRequest['skill'],
): string {
  const sections = [buildSystemPrompt(agent, policies)];
  if (skill !== undefined) {
    sections.push(`## Packaged skill: ${skill}`, getPackagedSkill(skill));
  }
  const projectInstructions = loadTargetProjectInstructions(directory);
  if (projectInstructions.length > 0) {
    sections.push('## Target repository instructions', projectInstructions);
  }
  if (!role.readonly && allowWrite) {
    sections.push(
      '## Mandatory write-gate enforcement',
      'The shared template and selected language guidelines above are mandatory. Before every code-writing tool call (edit, write, or a shell command that changes source), read the relevant guideline sections first. Do not write code and review its guidelines afterwards.',
    );
  }
  sections.push(
    '## Sideroom execution boundary',
    'Run only this Sideroom role through the Pi SDK. Do not delegate work to another agent, harness, task runner, or skill with a similar name. Never use or claim a fallback agent. The only valid pipeline roles are sideroom-planner, sideroom-implementer, sideroom-code-reviewer, sideroom-verifier, and sideroom-fixer.',
  );
  return sections.join('\n\n');
}

async function createSdkSession(
  options: PiSessionOptions,
  modelRuntime: Promise<ModelRuntime>,
): Promise<PiSession> {
  const resolvedRuntime = await modelRuntime;
  const resolved = resolveModel(options.model, resolvedRuntime);
  const settingsManager = createIsolatedSettings(options.cwd);
  const loader = createIsolatedResourceLoader({ ...options, settingsManager });
  await loader.reload();
  const { session } = await createAgentSession({
    cwd: options.cwd,
    modelRuntime: resolvedRuntime,
    ...(resolved.model === undefined ? {} : { model: resolved.model }),
    ...(resolved.thinkingLevel === undefined
      ? {}
      : { thinkingLevel: resolved.thinkingLevel }),
    tools: [...options.tools],
    resourceLoader: loader,
    settingsManager,
    sessionManager: SessionManager.inMemory(options.cwd),
  });
  return session;
}

/**
 * Load only package skills. Target-repository instructions are injected into the
 * explicit policy, so Pi cannot append instructions from its global agent dir.
 */
export function createIsolatedResourceLoader(
  options: Pick<PiSessionOptions, 'cwd' | 'systemPrompt'> & {
    readonly settingsManager?: SettingsManager;
  },
): DefaultResourceLoader {
  return new DefaultResourceLoader({
    cwd: options.cwd,
    // This avoids Pi's global agent directory; noContextFiles prevents target
    // context from being loaded implicitly, too.
    agentDir: options.cwd,
    settingsManager: options.settingsManager ?? SettingsManager.inMemory(),
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noContextFiles: true,
    additionalSkillPaths: [path.join(getPackageRoot(), 'skills')],
    systemPromptOverride: () => options.systemPrompt,
    appendSystemPromptOverride: () => [],
  });
}

/**
 * Retain only the user's Pi model preference, never global resource settings.
 * ModelRuntime separately reads Pi's stored authentication and model catalog.
 */
function createIsolatedSettings(directory: string): SettingsManager {
  const global = SettingsManager.create(directory);
  return SettingsManager.inMemory({
    ...(global.getDefaultProvider() === undefined
      ? {}
      : { defaultProvider: global.getDefaultProvider() }),
    ...(global.getDefaultModel() === undefined
      ? {}
      : { defaultModel: global.getDefaultModel() }),
    ...(global.getDefaultThinkingLevel() === undefined
      ? {}
      : { defaultThinkingLevel: global.getDefaultThinkingLevel() }),
    modelThinkingLevels: global.getAllModelThinkingLevels(),
  });
}

function resolveModel(model: string | undefined, runtime: ModelRuntime) {
  if (model === undefined) {
    return { model: undefined, thinkingLevel: undefined };
  }
  const resolved = resolveCliModel({ cliModel: model, modelRuntime: runtime });
  if (resolved.error !== undefined) {
    throw new Error(`Pi model ${model}: ${resolved.error}`);
  }
  return resolved;
}

/** Extract text from Pi's final assistant message. */
export function finalPiText(messages: readonly unknown[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!isRecord(message) || message.role !== 'assistant') {
      continue;
    }
    if (typeof message.errorMessage === 'string') {
      throw new Error(`Pi assistant failed: ${message.errorMessage}`);
    }
    if (!Array.isArray(message.content)) {
      throw new Error('Pi returned no final assistant text');
    }
    const text = message.content.flatMap((part) =>
      isRecord(part) && part.type === 'text' && typeof part.text === 'string'
        ? [part.text]
        : [],
    );
    if (text.length > 0) {
      return text.join('');
    }
    throw new Error('Pi returned no final assistant text');
  }
  throw new Error('Pi returned no final assistant text');
}

/** Supply task data separately from the Pi system prompt. */
function buildTaskPrompt(request: ModelRequest): string {
  const task = [
    'Task context (JSON):',
    JSON.stringify(request.input),
    '',
    'Return only one JSON value matching this schema:',
    request.schema,
  ].join('\n');
  return task;
}

/** Read only repository-owned instruction files, stopping at its git boundary. */
function loadTargetProjectInstructions(directory: string): string {
  const root = findProjectRoot(directory);
  const paths = directoriesFrom(root, path.resolve(directory));
  const files = paths.flatMap(readInstructionFile);
  return files
    .map(({ file, content }) => `### ${file}\n${content}`)
    .join('\n\n');
}

function findProjectRoot(directory: string): string {
  let current = path.resolve(directory);
  while (true) {
    if (existsSync(path.join(current, '.git'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(directory);
    }
    current = parent;
  }
}

function directoriesFrom(root: string, directory: string): readonly string[] {
  const result: string[] = [];
  let current = directory;
  while (true) {
    result.unshift(current);
    if (current === root) {
      return result;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return [directory];
    }
    current = parent;
  }
}

function readInstructionFile(
  directory: string,
): readonly { readonly file: string; readonly content: string }[] {
  for (const name of [
    'AGENTS.override.md',
    'AGENTS.md',
    'AGENTS.MD',
    'CLAUDE.md',
    'CLAUDE.MD',
  ]) {
    const file = path.join(directory, name);
    if (!existsSync(file)) {
      continue;
    }
    try {
      if (!statSync(file).isFile()) {
        continue;
      }
      return [{ file, content: readFileSync(file, 'utf8') }];
    } catch {
      return [];
    }
  }
  return [];
}

function parseJsonResponse<T>(text: string): T {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch (initialError) {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/g;
    let match = fenced.exec(trimmed);
    let candidate: string | undefined;
    while (match !== null) {
      candidate = match[1]?.trim();
      match = fenced.exec(trimmed);
    }
    if (candidate !== undefined) {
      try {
        return JSON.parse(candidate) as T;
      } catch (fencedError) {
        throw new Error('Pi response was not valid JSON', {
          cause: fencedError,
        });
      }
    }
    throw new Error('Pi response was not valid JSON', { cause: initialError });
  }
}

async function promptWithCancellation(
  session: PiSession,
  prompt: string,
  signal: AbortSignal | undefined,
): Promise<void> {
  if (signal === undefined) {
    await session.prompt(prompt);
    return;
  }
  if (signal.aborted) {
    await session.abort().catch(reportAbortFailure);
    throw abortError(signal);
  }
  await new Promise<void>((resolve, reject) => {
    const abort = (): void => {
      void session.abort().catch(reportAbortFailure);
      reject(abortError(signal));
    };
    signal.addEventListener('abort', abort, { once: true });
    void session.prompt(prompt).then(
      () => {
        signal.removeEventListener('abort', abort);
        resolve();
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}

function abortError(signal: AbortSignal): Error {
  const error = new Error(
    typeof signal.reason === 'string'
      ? signal.reason
      : 'Sideroom run cancelled.',
  );
  error.name = 'AbortError';
  return error;
}

function reportAbortFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    `Sideroom could not abort a timed-out Pi session: ${message}\n`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
