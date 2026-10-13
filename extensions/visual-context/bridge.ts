import { WebSocket } from 'ws';
import { type LocalBroker, startBroker } from './broker.ts';
import { parseEnvelope, send } from './envelope.ts';
import {
  MESSAGE_TYPE,
  PEER_ROLE,
  PI_ORIGIN,
  PROTOCOL_VERSION,
  parseSelection,
  type SessionDescriptor,
  type VisualSelection,
} from './model.ts';
import { endpoint, hasCode, type PairingIdentity } from './pairing.ts';

const RECONNECT_MS = 1_000;
const HEARTBEAT_MS = 20_000;
const STARTUP_TIMEOUT_MS = 10_000;
export interface VisualBridge {
  update(session: SessionDescriptor): void;
  close(): Promise<void>;
}
interface SessionConnectionOptions {
  readonly identity: PairingIdentity;
  readonly session: SessionDescriptor;
  readonly onSelection: (
    selection: VisualSelection,
    revision: string,
  ) => {
    readonly candidates: number;
  };
  readonly onError: (error: Error) => void;
}

export async function connectSession(
  options: SessionConnectionOptions,
): Promise<VisualBridge> {
  let session = options.session;
  let broker: LocalBroker | undefined;
  let socket: WebSocket | undefined;
  let retry: NodeJS.Timeout | undefined;
  let heartbeat: NodeJS.Timeout | undefined;
  let closed = false;
  let authenticated = false;
  let registered = false;
  let resolveStartup: () => void;
  let rejectStartup: (error: Error) => void;
  const startup = new Promise<void>((resolve, reject) => {
    resolveStartup = resolve;
    rejectStartup = reject;
  });
  const report = (cause: unknown): void => {
    if (closed) {
      return;
    }
    const error =
      cause instanceof Error
        ? cause
        : new Error('Cannot connect the Pi session.', { cause });
    if (!registered) {
      rejectStartup(error);
    } else {
      options.onError(error);
    }
  };
  const register = (): void => {
    if (socket && authenticated) {
      send(socket, { type: MESSAGE_TYPE.register, session });
    }
  };
  async function attach(): Promise<void> {
    if (closed) {
      return;
    }
    if (!broker) {
      try {
        const created = await startBroker({
          identity: options.identity,
          onError: options.onError,
        });
        if (closed) {
          await created.close();
          return;
        }
        broker = created;
      } catch (cause) {
        if (!hasCode(cause, 'EADDRINUSE')) {
          report(cause);
          scheduleRetry();
          return;
        }
      }
    }
    if (closed) {
      return;
    }
    const connection = new WebSocket(endpoint(options.identity), {
      origin: PI_ORIGIN,
      maxPayload: 32_768,
    });
    socket = connection;
    authenticated = false;
    const authenticationTimeout = setTimeout(() => {
      report(new Error('The local browser bridge did not authenticate.'));
      connection.terminate();
    }, STARTUP_TIMEOUT_MS);
    authenticationTimeout.unref();
    connection.on('open', () =>
      send(connection, {
        type: MESSAGE_TYPE.authenticate,
        role: PEER_ROLE.pi,
        version: PROTOCOL_VERSION,
        token: options.identity.token,
      }),
    );
    connection.on('error', report);
    connection.on('close', () => {
      clearTimeout(authenticationTimeout);
      clearInterval(heartbeat);
      authenticated = false;
      scheduleRetry();
    });
    connection.on('message', (bytes, binary) => {
      try {
        const message = parseEnvelope(bytes.toString(), binary);
        if (
          message.type === MESSAGE_TYPE.ready &&
          message.version === PROTOCOL_VERSION
        ) {
          clearTimeout(authenticationTimeout);
          authenticated = true;
          heartbeat = setInterval(
            () => send(connection, { type: MESSAGE_TYPE.ping }),
            HEARTBEAT_MS,
          );
          heartbeat.unref();
          register();
          return;
        }
        if (
          message.type === MESSAGE_TYPE.register &&
          message.revision === session.revision
        ) {
          registered = true;
          resolveStartup();
          return;
        }
        if (message.type === MESSAGE_TYPE.error) {
          report(new Error(String(message.message)));
          return;
        }
        if (message.type !== MESSAGE_TYPE.deliver) {
          return;
        }
        try {
          if (closed || message.revision !== session.revision) {
            throw new Error(
              'The Pi conversation changed. Select the element again.',
            );
          }
          const receipt = options.onSelection(
            parseSelection(message.selection),
            session.revision,
          );
          send(connection, {
            type: MESSAGE_TYPE.result,
            requestId: message.requestId,
            candidates: receipt.candidates,
          });
        } catch (cause) {
          const error =
            cause instanceof Error
              ? cause
              : new Error('Cannot receive browser selection.', { cause });
          options.onError(error);
          send(connection, {
            type: MESSAGE_TYPE.result,
            requestId: message.requestId,
            error: error.message,
          });
        }
      } catch (cause) {
        report(cause);
      }
    });
  }
  function scheduleRetry(): void {
    if (closed || retry) {
      return;
    }
    retry = setTimeout(() => {
      retry = undefined;
      void attach().catch(report);
    }, RECONNECT_MS);
    retry.unref();
  }
  let closing: Promise<void> | undefined;
  const bridge: VisualBridge = {
    update(next) {
      session = next;
      register();
    },
    close() {
      if (closing) {
        return closing;
      }
      closed = true;
      clearTimeout(retry);
      clearInterval(heartbeat);
      closing = (async () => {
        if (socket && socket.readyState !== WebSocket.CLOSED) {
          const disconnected = new Promise<void>((resolve) =>
            socket?.once('close', resolve),
          );
          socket.terminate();
          await disconnected;
        }
        await broker?.close();
      })();
      return closing;
    },
  };
  const deadline = setTimeout(
    () =>
      rejectStartup(
        new Error('The Pi session could not join the local browser bridge.'),
      ),
    STARTUP_TIMEOUT_MS,
  );
  deadline.unref();
  void attach().catch(report);
  try {
    await startup;
    return bridge;
  } catch (cause) {
    await bridge.close();
    throw cause;
  } finally {
    clearTimeout(deadline);
  }
}
