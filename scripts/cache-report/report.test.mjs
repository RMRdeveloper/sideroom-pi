import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatReport, sumSessions } from './report.mjs';

const firstSession = {
  path: 'sessions/a.jsonl',
  calls: 3,
  input: 1000,
  cacheRead: 9000,
  cacheWrite: 100,
  skippedLines: 0,
  hitRate: 89,
  openings: {
    updatedBoard: { count: 1, totalRecomputed: 1000, averageRecomputed: 1000 },
    untouchedBoard: { count: 2, totalRecomputed: 100, averageRecomputed: 50 },
  },
};

const secondSession = {
  path: 'sessions/b.jsonl',
  calls: 5,
  input: 500,
  cacheRead: 4500,
  cacheWrite: 50,
  skippedLines: 1,
  hitRate: 89,
  openings: {
    updatedBoard: { count: 2, totalRecomputed: 800, averageRecomputed: 400 },
    untouchedBoard: { count: 1, totalRecomputed: 200, averageRecomputed: 200 },
  },
};

test('sums sessions into one opening split', () => {
  const total = sumSessions([firstSession, secondSession]);

  assert.equal(total.calls, 8);
  assert.equal(total.input, 1500);
  assert.equal(total.cacheRead, 13500);
  assert.equal(total.cacheWrite, 150);
  assert.equal(total.skippedLines, 1);
  assert.equal(total.hitRate, 89);
  assert.deepEqual(total.openings.updatedBoard, {
    count: 3,
    totalRecomputed: 1800,
    averageRecomputed: 600,
  });
  assert.deepEqual(total.openings.untouchedBoard, {
    count: 3,
    totalRecomputed: 300,
    averageRecomputed: 100,
  });
});

test('prints the totals, the opening split, and one row per session', () => {
  const report = formatReport([firstSession, secondSession]);

  assert.match(report, /sessions: 2/);
  assert.match(report, /assistant calls: 8/);
  assert.match(report, /hit rate: 89%/);
  assert.match(report, /skipped torn lines: 1/);
  assert.match(report, /after a work-board update/);
  assert.match(report, /after a turn without one/);
  assert.match(report, /a\.jsonl/);
  assert.match(report, /b\.jsonl/);
});

test('reports an empty session list without failing', () => {
  const report = formatReport([]);

  assert.match(report, /sessions: 0/);
  assert.match(report, /hit rate: 0%/);
  assert.equal(report.includes('skipped torn lines'), false);
});
