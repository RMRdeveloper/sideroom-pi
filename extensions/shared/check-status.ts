import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';

const CHECK_STATUS_EVENT = 'sideroom:check-status';

export const CHECK_OUTCOME = {
  notRun: 'not-run',
  passed: 'passed',
  failed: 'failed',
  stale: 'stale',
  unknown: 'unknown',
} as const;

export type CheckOutcome = (typeof CHECK_OUTCOME)[keyof typeof CHECK_OUTCOME];

export interface CheckStatus {
  readonly command: string | undefined;
  readonly green: boolean;
  readonly outcome: CheckOutcome;
}

interface CheckStatusRequest {
  readonly ctx: ExtensionContext;
  status: CheckStatus | undefined;
}

export function registerCheckStatus(
  pi: ExtensionAPI,
  resolve: (ctx: ExtensionContext) => CheckStatus | undefined,
): void {
  pi.events.on(CHECK_STATUS_EVENT, (payload) => {
    const request = payload as CheckStatusRequest;
    request.status = resolve(request.ctx);
  });
}

export function readCheckStatus(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
): CheckStatus | undefined {
  const request: CheckStatusRequest = { ctx, status: undefined };
  pi.events.emit(CHECK_STATUS_EVENT, request);
  return request.status;
}
