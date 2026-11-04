export const MAX_RESEARCH_TIMEOUT_MS = 1_800_000;
export const MAX_RESEARCH_OUTPUT_BYTES = 256_000;

export interface ResearchLimits {
  readonly timeoutMs: number;
  readonly outputBytes: number;
}

interface LimitInput {
  readonly value: string | undefined;
  readonly fallback: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly name: string;
}

function configuredLimit({ value, fallback, minimum, maximum, name }: LimitInput): number {
  if (value === undefined) {
    return fallback;
  }
  if (!/^\d+$/u.test(value)) {
    throw new Error(`${name} must be a whole number between ${String(minimum)} and ${String(maximum)}.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be a whole number between ${String(minimum)} and ${String(maximum)}.`);
  }
  return parsed;
}

export function researchLimits(environment: Readonly<Record<string, string | undefined>>): ResearchLimits {
  return {
    timeoutMs: configuredLimit({ value: environment.SIDEROOM_RESEARCH_TIMEOUT_MS, fallback: MAX_RESEARCH_TIMEOUT_MS, minimum: 1_000, maximum: MAX_RESEARCH_TIMEOUT_MS, name: 'SIDEROOM_RESEARCH_TIMEOUT_MS' }),
    outputBytes: configuredLimit({ value: environment.SIDEROOM_RESEARCH_OUTPUT_BYTES, fallback: MAX_RESEARCH_OUTPUT_BYTES, minimum: 1_024, maximum: MAX_RESEARCH_OUTPUT_BYTES, name: 'SIDEROOM_RESEARCH_OUTPUT_BYTES' }),
  };
}
