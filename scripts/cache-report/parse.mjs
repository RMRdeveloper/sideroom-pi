// Turns Pi's session JSONL lines into the two facts the cache report needs:
// how many tokens each assistant call re-sent, and whether the turn before it
// moved the work board.

const MESSAGE_ENTRY = 'message';
const USER_ROLE = 'user';
const ASSISTANT_ROLE = 'assistant';
const TOOL_RESULT_ROLE = 'toolResult';
const BOARD_TOOL_NAME = 'sideroom_todo';
const EMPTY_BOARD_FINGERPRINT = '[]';

export function parseSessionLines(lines) {
  const entries = [];
  let skippedLines = 0;
  for (const line of lines) {
    if (line.length === 0) {
      continue;
    }
    try {
      entries.push(JSON.parse(line));
    } catch {
      // Pi appends JSONL while the session runs, so a torn last line is
      // expected: count it and keep going instead of failing the report.
      skippedLines += 1;
    }
  }
  return { ...summarizeEntries(entries), skippedLines };
}

export function hitRateOf(input, cacheRead, cacheWrite) {
  const promptTokens = input + cacheRead + cacheWrite;
  if (promptTokens === 0) {
    return 0;
  }
  return Math.round((100 * cacheRead) / promptTokens);
}

function summarizeEntries(entries) {
  const calls = [];
  let opensTurn = false;
  let turnMovedBoard = false;
  let previousTurnMovedBoard = false;
  let boardFingerprint = EMPTY_BOARD_FINGERPRINT;

  for (const entry of entries) {
    if (entry?.type !== MESSAGE_ENTRY) {
      continue;
    }
    const message = entry.message;
    if (message?.role === USER_ROLE) {
      previousTurnMovedBoard = turnMovedBoard;
      turnMovedBoard = false;
      opensTurn = true;
      continue;
    }
    if (message?.role === TOOL_RESULT_ROLE) {
      if (message.toolName !== BOARD_TOOL_NAME) {
        continue;
      }
      const nextBoardFingerprint = fingerprintBoardItems(
        message.details?.items,
      );
      if (nextBoardFingerprint === undefined) {
        continue;
      }
      const boardChanged =
        message.isError !== true &&
        message.details?.error === undefined &&
        nextBoardFingerprint !== boardFingerprint;
      boardFingerprint = nextBoardFingerprint;
      if (boardChanged) {
        turnMovedBoard = true;
      }
      continue;
    }
    if (message?.role !== ASSISTANT_ROLE || message.usage === undefined) {
      continue;
    }
    calls.push({
      input: message.usage.input ?? 0,
      cacheRead: message.usage.cacheRead ?? 0,
      cacheWrite: message.usage.cacheWrite ?? 0,
      opensTurn,
      previousTurnMovedBoard,
    });
    opensTurn = false;
  }

  return summarizeCalls(calls);
}

function summarizeCalls(calls) {
  const openings = {
    updatedBoard: { count: 0, totalRecomputed: 0 },
    untouchedBoard: { count: 0, totalRecomputed: 0 },
  };
  let input = 0;
  let cacheRead = 0;
  let cacheWrite = 0;

  for (const call of calls) {
    input += call.input;
    cacheRead += call.cacheRead;
    cacheWrite += call.cacheWrite;
    if (!call.opensTurn) {
      continue;
    }
    const group = call.previousTurnMovedBoard
      ? openings.updatedBoard
      : openings.untouchedBoard;
    group.count += 1;
    group.totalRecomputed += call.input + call.cacheWrite;
  }

  return {
    calls: calls.length,
    input,
    cacheRead,
    cacheWrite,
    hitRate: hitRateOf(input, cacheRead, cacheWrite),
    openings: {
      updatedBoard: closeGroup(openings.updatedBoard),
      untouchedBoard: closeGroup(openings.untouchedBoard),
    },
  };
}

function fingerprintBoardItems(items) {
  if (!Array.isArray(items)) {
    return undefined;
  }
  return JSON.stringify(items);
}

function closeGroup(group) {
  return {
    count: group.count,
    totalRecomputed: group.totalRecomputed,
    averageRecomputed:
      group.count === 0 ? 0 : Math.round(group.totalRecomputed / group.count),
  };
}
