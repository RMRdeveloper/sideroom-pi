// Formats the per-session cache facts into one text report. Pure: it takes what
// parse.mjs produced, plus the session file path, and returns the text the
// entry script prints.

import { basename } from 'node:path';
import { hitRateOf } from './parse.mjs';

const NUMBER_FORMAT = new Intl.NumberFormat('en-US');
const OPENING_ROW = {
  label: 34,
  count: 7,
  average: 16,
  total: 18,
};
const SESSION_ROW = {
  path: 68,
  calls: 7,
  hit: 6,
  board: 7,
  other: 7,
};

export function sumSessions(sessions) {
  const input = sumOf(sessions, (session) => session.input);
  const cacheRead = sumOf(sessions, (session) => session.cacheRead);
  const cacheWrite = sumOf(sessions, (session) => session.cacheWrite);
  return {
    calls: sumOf(sessions, (session) => session.calls),
    input,
    cacheRead,
    cacheWrite,
    skippedLines: sumOf(sessions, (session) => session.skippedLines),
    hitRate: hitRateOf(input, cacheRead, cacheWrite),
    openings: {
      updatedBoard: sumGroups(sessions, 'updatedBoard'),
      untouchedBoard: sumGroups(sessions, 'untouchedBoard'),
    },
  };
}

export function formatReport(sessions) {
  const total = sumSessions(sessions);
  const lines = [
    formatTotals(sessions.length, total),
    '',
    formatOpeningRow([
      'turn opening',
      'turns',
      'avg recomputed',
      'total recomputed',
    ]),
    formatOpeningRow([
      'after a work-board update',
      String(total.openings.updatedBoard.count),
      formatNumber(total.openings.updatedBoard.averageRecomputed),
      formatNumber(total.openings.updatedBoard.totalRecomputed),
    ]),
    formatOpeningRow([
      'after a turn without one',
      String(total.openings.untouchedBoard.count),
      formatNumber(total.openings.untouchedBoard.averageRecomputed),
      formatNumber(total.openings.untouchedBoard.totalRecomputed),
    ]),
    '',
    formatSessionRow(['path', 'calls', 'hit', 'board', 'other']),
  ];

  for (const session of sessions) {
    lines.push(formatSessionRow(sessionRowCells(session)));
  }
  return lines.join('\n');
}

function formatTotals(sessionCount, total) {
  const parts = [
    `sessions: ${String(sessionCount)}`,
    `assistant calls: ${formatNumber(total.calls)}`,
    `cache read: ${formatNumber(total.cacheRead)}`,
    `hit rate: ${String(total.hitRate)}%`,
  ];
  if (total.skippedLines > 0) {
    parts.push(`skipped torn lines: ${formatNumber(total.skippedLines)}`);
  }
  return parts.join('   ');
}

function sessionRowCells(session) {
  return [
    basename(session.path),
    String(session.calls),
    `${String(session.hitRate)}%`,
    String(session.openings.updatedBoard.count),
    String(session.openings.untouchedBoard.count),
  ];
}

function formatNumber(value) {
  return NUMBER_FORMAT.format(value);
}

function sumOf(sessions, pick) {
  let total = 0;
  for (const session of sessions) {
    total += pick(session);
  }
  return total;
}

function sumGroups(sessions, groupName) {
  let count = 0;
  let totalRecomputed = 0;
  for (const session of sessions) {
    const group = session.openings[groupName];
    count += group.count;
    totalRecomputed += group.totalRecomputed;
  }
  return {
    count,
    totalRecomputed,
    averageRecomputed: count === 0 ? 0 : Math.round(totalRecomputed / count),
  };
}

function formatOpeningRow(cells) {
  return [
    cells[0].padEnd(OPENING_ROW.label),
    cells[1].padStart(OPENING_ROW.count),
    cells[2].padStart(OPENING_ROW.average),
    cells[3].padStart(OPENING_ROW.total),
  ].join(' ');
}

function formatSessionRow(cells) {
  return [
    cells[0].padEnd(SESSION_ROW.path),
    cells[1].padStart(SESSION_ROW.calls),
    cells[2].padStart(SESSION_ROW.hit),
    cells[3].padStart(SESSION_ROW.board),
    cells[4].padStart(SESSION_ROW.other),
  ].join(' ');
}
