export interface DoneState {
  checksGreen: boolean;
  mutatedSource: boolean;
  mutatedTest: boolean;
  noticedMissingTest: boolean;
}

export const MISSING_TEST_NOTICE_TYPE = 'sideroom-missing-test-notice';

const TEST_DIRECTORY = /(?:^|\/)(?:__tests__|tests?|specs?)(?:\/|$)/;

const TEST_FILE =
  /(?:^|\/)(?:test_[\w.-]*\.py|[\w.-]*[._](?:test|spec)\.[\w.-]+|[\w.-]*(?:Test|Tests)\.java)$/;

const SOURCE_FILE = /\.(?:[cm]?js|jsx|ts|tsx|go|java|php|py|rs)$/i;

export function createDoneState(): DoneState {
  return {
    checksGreen: false,
    mutatedSource: false,
    mutatedTest: false,
    noticedMissingTest: false,
  };
}

export function resetDoneRun(state: DoneState): void {
  state.checksGreen = false;
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

export function shouldNoticeMissingTest(
  state: DoneState,
  hasTests: boolean,
): boolean {
  return (
    hasTests &&
    state.mutatedSource &&
    !state.mutatedTest &&
    !state.noticedMissingTest
  );
}

export function formatMissingTestNotice(): string {
  return 'This run changed code and no test file. Check whether the existing tests cover the new behavior, and add or update a test where they do not. Reuse the checks that already passed after your last edit, and run only the ones that are missing, failed or out of date. Any further code or test edit makes earlier checks stale.';
}
