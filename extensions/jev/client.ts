import {
  buildRequestBody,
  JEV_ENDPOINT,
  type JevFileState,
  type JevFinding,
  parseEnvelope,
  readFindings,
} from './model.ts';

export const JEV_REQUEST_TIMEOUT_MS = 3_000;

export const JEV_FAILURE = {
  quota: 'quota',
  auth: 'auth',
  rateLimited: 'rateLimited',
  transient: 'transient',
  cancelled: 'cancelled',
} as const;

const HTTP_STATUS = {
  unauthorized: 401,
  paymentRequired: 402,
  forbidden: 403,
  tooManyRequests: 429,
  firstClientError: 400,
} as const;

export type JevFailure = (typeof JEV_FAILURE)[keyof typeof JEV_FAILURE];

export interface JevHttpRequest {
  readonly apiKey: string;
  readonly body: string;
  readonly signal: AbortSignal | undefined;
}

export interface JevHttpResponse {
  readonly status: number;
  readonly text: string;
}

export type JevTransport = (
  request: JevHttpRequest,
) => Promise<JevHttpResponse>;

export interface JevAttempt {
  readonly findings: readonly JevFinding[] | undefined;
  readonly model: string | undefined;
  readonly failure: JevFailure | undefined;
}

// The endpoint is a package constant, never a value from the environment or the
// session, so the outbound URL cannot be steered by the repository being edited.
export function createFetchTransport(
  timeoutMs: number = JEV_REQUEST_TIMEOUT_MS,
): JevTransport {
  return async (request) => {
    const response = await fetch(JEV_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${request.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: request.body,
      signal: requestSignal(timeoutMs, request.signal),
    });
    return { status: response.status, text: await response.text() };
  };
}

// Pi waits for every tool_result handler before the result reaches the model,
// so the user's Escape has to cut the request, not only the timeout.
function requestSignal(
  timeoutMs: number,
  runSignal: AbortSignal | undefined,
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (runSignal === undefined) {
    return timeout;
  }
  return AbortSignal.any([timeout, runSignal]);
}

export function classifyStatus(status: number): JevFailure | undefined {
  if (status === HTTP_STATUS.unauthorized || status === HTTP_STATUS.forbidden) {
    return JEV_FAILURE.auth;
  }
  if (status === HTTP_STATUS.paymentRequired) {
    return JEV_FAILURE.quota;
  }
  if (status === HTTP_STATUS.tooManyRequests) {
    return JEV_FAILURE.rateLimited;
  }
  if (status >= HTTP_STATUS.firstClientError) {
    return JEV_FAILURE.transient;
  }
  return undefined;
}

// A Jev failure is a missing note, never an error: the mutation already
// succeeded and the mechanical rules already ran. So this returns a value
// instead of throwing, and the caller only decides whether to keep calling.
export async function askJev(
  transport: JevTransport,
  apiKey: string,
  file: JevFileState,
  signal: AbortSignal | undefined,
): Promise<JevAttempt> {
  const body = JSON.stringify(buildRequestBody(file));
  let response: JevHttpResponse;
  try {
    response = await transport({ apiKey, body, signal });
  } catch {
    return {
      findings: undefined,
      model: undefined,
      failure:
        signal?.aborted === true
          ? JEV_FAILURE.cancelled
          : JEV_FAILURE.transient,
    };
  }

  const failure = classifyStatus(response.status);
  if (failure !== undefined) {
    return { findings: undefined, model: undefined, failure };
  }

  const envelope = parseEnvelope(response.text);
  if (envelope === undefined) {
    return { findings: [], model: undefined, failure: undefined };
  }
  return {
    findings: readFindings(envelope),
    model: envelope.model,
    failure: undefined,
  };
}
