import { WebSocket } from 'ws';

const INVALID_MESSAGE = 'Invalid inspector message.';

export function send(
  socket: WebSocket,
  message: Readonly<Record<string, unknown>>,
): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

export function parseEnvelope(
  source: string,
  binary = false,
): Record<string, unknown> {
  let message: unknown;
  try {
    message = JSON.parse(source);
  } catch (cause) {
    throw new Error(INVALID_MESSAGE, { cause });
  }
  if (
    binary ||
    !message ||
    typeof message !== 'object' ||
    Array.isArray(message) ||
    !('type' in message)
  ) {
    throw new Error(INVALID_MESSAGE);
  }
  return message as Record<string, unknown>;
}
