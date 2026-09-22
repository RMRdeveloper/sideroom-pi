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
  transient: 'transient',
} as const;

export type JevFailure = (typeof JEV_FAILURE)[keyof typeof JEV_FAILURE];

export interface JevHttpRequest {
  readonly apiKey: string;
  readonly body: string;
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
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { status: response.status, text: await response.text() };
  };
}

export function classifyStatus(status: number): JevFailure | undefined {
  if (status === 401 || status === 403) {
    return JEV_FAILURE.auth;
  }
  if (status === 402) {
    return JEV_FAILURE.quota;
  }
  if (status >= 400) {
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
): Promise<JevAttempt> {
  const body = JSON.stringify(buildRequestBody(file));
  let response: JevHttpResponse;
  try {
    response = await transport({ apiKey, body });
  } catch {
    return {
      findings: undefined,
      model: undefined,
      failure: JEV_FAILURE.transient,
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
