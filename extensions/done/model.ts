export interface DoneState {
  mutated: boolean;
  checksGreen: boolean;
  steeredThisTurn: boolean;
  steerCount: number;
  mutatedSource: boolean;
  mutatedTest: boolean;
  noticedMissingTest: boolean;
}

export const MAX_DONE_STEERS = 2;

export const DONE_GATE_TYPE = 'sideroom-done-gate';

export const MISSING_TEST_NOTICE_TYPE = 'sideroom-missing-test-notice';

const TEST_DIRECTORY = /(?:^|\/)(?:__tests__|tests?|specs?)(?:\/|$)/;

// Test paths are recognised by name only: the notice never claims the right
// test exists, so a missed convention only costs a nudge, never a false pass.
const TEST_FILE =
  /(?:^|\/)(?:test_[\w.-]*\.py|[\w.-]*[._](?:test|spec)\.[\w.-]+|[\w.-]*(?:Test|Tests)\.java)$/;

const SOURCE_FILE = /\.(?:[cm]?js|jsx|ts|tsx|go|java|php|py|rs)$/i;

export function createDoneState(): DoneState {
  return {
    mutated: false,
    checksGreen: false,
    steeredThisTurn: false,
    steerCount: 0,
    mutatedSource: false,
    mutatedTest: false,
    noticedMissingTest: false,
  };
}

export function resetDoneRun(state: DoneState): void {
  state.mutated = false;
  state.checksGreen = false;
  state.steeredThisTurn = false;
  state.steerCount = 0;
  state.mutatedSource = false;
  state.mutatedTest = false;
  state.noticedMissingTest = false;
}

export function isTestPath(path: string): boolean {
  const normalized = path.replaceAll('\\', '/');
  return TEST_DIRECTORY.test(normalized) || TEST_FILE.test(normalized);
}

export function isSourcePath(path: string): boolean {
  const normalized = path.replaceAll('\\', '/');
  return SOURCE_FILE.test(normalized);
}

export function shouldSteerDone(
  state: DoneState,
  hasCommand: boolean,
): boolean {
  return (
    hasCommand &&
    state.mutated &&
    !state.checksGreen &&
    !state.steeredThisTurn &&
    state.steerCount < MAX_DONE_STEERS
  );
}

export function shouldNoticeMissingTest(
  state: DoneState,
  hasTests: boolean,
): boolean {
  return (
    hasTests &&
    state.mutatedSource &&
    !state.mutatedTest &&
    !state.noticedMissingTest &&
    state.steerCount < MAX_DONE_STEERS
  );
}

export function formatDoneSteer(display: string): string {
  return `Run \`${display}\` and make it pass before finishing.`;
}

export function formatMissingTestNotice(): string {
  return 'This run changed code files and no test file. Add or update the test that covers the change before finishing.';
}
