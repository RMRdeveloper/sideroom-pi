import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import {
  detectLanguagePolicies,
  type FilePolicy,
} from '../core/language-policy.ts';

export interface LanguagePolicyPreflight {
  readonly request: string;
  readonly policies: readonly FilePolicy[];
}

/** Detect and confirm the complete policy map before any pipeline object or progress UI exists. */
export async function preflightLanguagePolicies(
  request: string,
  context: Pick<ExtensionCommandContext, 'cwd' | 'hasUI'> & {
    readonly ui: Pick<ExtensionCommandContext['ui'], 'confirm' | 'notify'>;
  },
): Promise<LanguagePolicyPreflight | undefined> {
  const detection = detectLanguagePolicies(request, {
    cwd: context.cwd,
  });
  if (detection.kind === 'clarification') {
    context.ui.notify(
      `Sideroom needs clarification: ${detection.reason} Add project-relative target paths to the request and run again.`,
      'error',
    );
    return undefined;
  }
  if (detection.kind === 'inferred') {
    context.ui.notify(
      `Sideroom inferred the file-policy map from repository evidence (${detection.policies.map(({ file, policy }) => `${file} → ${policy}`).join(', ')}) and continues without confirmation. ${detection.note}`,
      'info',
    );
    return { request, policies: detection.policies };
  }
  if (!context.hasUI) {
    context.ui.notify(
      'Sideroom needs interactive confirmation of the file-policy map before it can run.',
      'error',
    );
    return undefined;
  }
  const confirmed = await context.ui.confirm(
    'Sideroom file-policy map',
    formatFilePolicyMap(detection.policies),
  );
  if (!confirmed) {
    context.ui.notify(
      'Sideroom was cancelled before the pipeline started.',
      'info',
    );
    return undefined;
  }
  return { request, policies: detection.policies };
}

function formatFilePolicyMap(policies: readonly FilePolicy[]): string {
  return [
    'Confirm the complete file-policy map before Sideroom starts:',
    '',
    ...policies.map(({ file, policy }) => `${file} → ${policy}`),
    '',
    'Plan-discovered files outside this confirmed map must not be written; start a new run to confirm their policy.',
  ].join('\n');
}
