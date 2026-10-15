import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { compilerPackage, INSPECTOR_VERSION } from './compiler-config.ts';
import { configureSource } from './configure.ts';
import { allowedPath, MAX_FILE_BYTES } from './files.ts';
import { discoverProjects, inspectProject, readManifest } from './projects.ts';

export const VISUAL_SETUP_TOOL = 'sideroom_visual_setup';
const SetupSchema = Type.Object(
  {
    action: Type.Union([
      Type.Literal('discover'),
      Type.Literal('prepare'),
      Type.Literal('bind'),
    ]),
    project: Type.Optional(
      Type.String({
        minLength: 1,
        maxLength: 2_048,
        pattern: '^[^\\x00-\\x1f\\x7f]*$',
      }),
    ),
    page: Type.Optional(Type.String({ minLength: 1, maxLength: 2_048 })),
  },
  { additionalProperties: false },
);

export function prepareSetup(cwd: string, project: string) {
  const inspected = inspectProject(cwd, project);
  if (!inspected.config || !inspected.kind) {
    throw new Error(
      'No supported build configuration was found. Create or identify the framework configuration before preparing inspector setup.',
    );
  }
  const config = allowedPath(cwd, inspected.config);
  if (!config || statSync(config).size > MAX_FILE_BYTES) {
    throw new Error('The configuration is missing, excluded, or too large.');
  }
  const root = dirname(config);
  const manifest = readManifest(root);
  const nextVersion =
    manifest.dependencies?.next ?? manifest.devDependencies?.next;
  const original = readFileSync(config, 'utf8');
  const prepared = configureSource({
    source: original,
    kind: inspected.kind,
    commonjs: config.endsWith('.cjs'),
    typescript: /\.(ts|mts)$/u.test(config),
    nextMajor: nextVersion ? Number(nextVersion.match(/\d+/u)?.[0]) : undefined,
  });
  return {
    project: inspected,
    edit: {
      path: inspected.config,
      oldText: original,
      newText: prepared.source,
    },
    install: {
      cwd: join(cwd, inspected.path),
      command: inspected.manager,
      args:
        inspected.manager === 'npm'
          ? [
              'install',
              '--save-dev',
              `${compilerPackage(inspected.kind)}@${INSPECTOR_VERSION}`,
            ]
          : [
              'add',
              '--dev',
              `${compilerPackage(inspected.kind)}@${INSPECTOR_VERSION}`,
            ],
    },
    checkScripts: Object.keys(manifest.scripts ?? {}).filter((script) =>
      ['check', 'typecheck', 'lint', 'test', 'build'].includes(script),
    ),
    instructions:
      'Apply this plan through normal Pi edit/bash tools. Follow sideroom-visual-setup for runtime path portability, installation and browser verification.',
  };
}

export function registerVisualSetup(
  pi: ExtensionAPI,
  onBind: (binding: {
    readonly project: string;
    readonly page: string;
    readonly cwd: string;
  }) => void,
): void {
  pi.registerTool({
    name: VISUAL_SETUP_TOOL,
    label: 'Sideroom Visual Setup',
    description:
      'Discover child web projects, prepare a compiler-location integration for one selected project, or associate a browser page with its project. Prepare returns an exact configuration edit and dependency installation command; apply them through the normal Pi edit and bash tools. Does not edit project files itself.',
    promptSnippet:
      'Set up precise browser source locations in a selected web project, including projects below the Pi working directory.',
    promptGuidelines: [
      'Read sideroom-visual-setup before enabling or reviewing compiler context. The skill owns project selection, runtime path portability, installation and verification; prepare supplies the configuration template and commands.',
    ],
    parameters: SetupSchema,
    executionMode: 'sequential',
    execute: async (_id, params, _signal, _update, ctx) => {
      if (!ctx.isProjectTrusted()) {
        throw new Error(
          'Trust this workspace in Pi before setting up visual context.',
        );
      }
      if (params.action === 'discover') {
        const discovery = discoverProjects(ctx.cwd);
        return {
          content: [{ type: 'text', text: JSON.stringify(discovery, null, 2) }],
          details: discovery,
        };
      }
      if (!params.project) {
        throw new Error(
          'Choose an explicit project path relative to the Pi working directory.',
        );
      }
      if (params.action === 'prepare') {
        const plan = prepareSetup(ctx.cwd, params.project);
        return {
          content: [{ type: 'text', text: JSON.stringify(plan, null, 2) }],
          details: plan,
        };
      }
      if (!params.page) {
        throw new Error(
          'Provide the browser page to associate with the selected project.',
        );
      }
      onBind({ project: params.project, page: params.page, cwd: ctx.cwd });
      return {
        content: [
          {
            type: 'text',
            text: 'The page is associated with the project. Pending selections were resolved again; compiler locations still require local markup validation.',
          },
        ],
        details: {},
      };
    },
  });
}
