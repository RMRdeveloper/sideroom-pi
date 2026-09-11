export interface DoneState {
  mutated: boolean;
  checksGreen: boolean;
  steeredThisTurn: boolean;
  steerCount: number;
}

export const MAX_DONE_STEERS = 2;

export const DONE_GATE_TYPE = 'sideroom-done-gate';

export function createDoneState(): DoneState {
  return {
    mutated: false,
    checksGreen: false,
    steeredThisTurn: false,
    steerCount: 0,
  };
}

export function resetDoneRun(state: DoneState): void {
  state.mutated = false;
  state.checksGreen = false;
  state.steeredThisTurn = false;
  state.steerCount = 0;
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

export function formatDoneSteer(display: string): string {
  return `Run \`${display}\` and make it pass before finishing.`;
}
