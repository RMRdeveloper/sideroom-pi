import assert from 'node:assert/strict';
import test from 'node:test';
import {
  askJev,
  classifyStatus,
  createFetchTransport,
  JEV_FAILURE,
  type JevTransport,
} from './client.ts';
import { buildFileState, JEV_ENDPOINT } from './model.ts';

const FILE = buildFileState('src/a.ts', 'const a = 1;\n', 'edit', []);

function transportReturning(status: number, text: string): JevTransport {
  return async () => ({ status, text });
}

test('maps a status code to the failure policy', () => {
  assert.equal(classifyStatus(401), JEV_FAILURE.auth);
  assert.equal(classifyStatus(403), JEV_FAILURE.auth);
  assert.equal(classifyStatus(402), JEV_FAILURE.quota);
  assert.equal(classifyStatus(429), JEV_FAILURE.rateLimited);
  assert.equal(classifyStatus(503), JEV_FAILURE.transient);
  assert.equal(classifyStatus(200), undefined);
});

test('returns findings, and the served model, from a good answer', async () => {
  const attempt = await askJev(
    transportReturning(
      200,
      '{"model":"jev-1.13.0","answers":{"guard-clauses":{"type":"noul","noul":0.88}}}',
    ),
    'key',
    FILE,
    undefined,
  );

  assert.equal(attempt.failure, undefined);
  assert.equal(attempt.model, 'jev-1.13.0');
  assert.deepEqual(attempt.findings, [
    { ruleId: 'guard-clauses', probability: 0.88 },
  ]);
});

test('reports a failure instead of throwing when the transport rejects', async () => {
  const attempt = await askJev(
    async () => {
      throw new Error('offline');
    },
    'key',
    FILE,
    undefined,
  );

  assert.equal(attempt.failure, JEV_FAILURE.transient);
  assert.equal(attempt.findings, undefined);
});

test('reports a cancel, not a network failure, when the user aborted', async () => {
  const controller = new AbortController();
  const attempt = await askJev(
    async (request) => {
      controller.abort();
      assert.equal(request.signal, controller.signal);
      throw new Error('aborted');
    },
    'key',
    FILE,
    controller.signal,
  );

  assert.equal(attempt.failure, JEV_FAILURE.cancelled);
});

test('reports the failure class for a bad status', async () => {
  const quota = await askJev(
    transportReturning(402, ''),
    'key',
    FILE,
    undefined,
  );
  assert.equal(quota.failure, JEV_FAILURE.quota);

  const auth = await askJev(
    transportReturning(401, ''),
    'key',
    FILE,
    undefined,
  );
  assert.equal(auth.failure, JEV_FAILURE.auth);

  const limited = await askJev(
    transportReturning(429, ''),
    'key',
    FILE,
    undefined,
  );
  assert.equal(limited.failure, JEV_FAILURE.rateLimited);
});

test('treats an unusable body as no answer, not as a failure', async () => {
  const attempt = await askJev(
    transportReturning(200, 'nonsense'),
    'key',
    FILE,
    undefined,
  );
  assert.equal(attempt.failure, undefined);
  assert.deepEqual(attempt.findings, []);
});

test('posts to the packaged endpoint with a bearer token', async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    calls.push({ url: String(url), init });
    return new Response('{"answers":{}}', { status: 200 });
  }) as typeof fetch;

  try {
    const transport = createFetchTransport(1_000);
    const response = await transport({
      apiKey: 'secret',
      body: '{}',
      signal: undefined,
    });
    assert.equal(response.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls[0]?.url, JEV_ENDPOINT);
  const headers = calls[0]?.init?.headers as Record<string, string>;
  assert.equal(headers.Authorization, 'Bearer secret');
  assert.equal(headers['Content-Type'], 'application/json');
});

test('cuts the request when the run is aborted', async () => {
  const signals: (AbortSignal | null | undefined)[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (
    _url: string | URL | Request,
    init?: RequestInit,
  ) => {
    signals.push(init?.signal);
    return new Response('{"answers":{}}', { status: 200 });
  }) as typeof fetch;

  const controller = new AbortController();
  try {
    await createFetchTransport(60_000)({
      apiKey: 'secret',
      body: '{}',
      signal: controller.signal,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(signals[0]?.aborted, false);
  controller.abort();
  assert.equal(signals[0]?.aborted, true);
});
