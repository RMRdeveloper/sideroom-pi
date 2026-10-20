import { randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { Check } from 'typebox/value';
import { type WebSocket, WebSocketServer } from 'ws';
import { parseEnvelope, send } from './envelope.ts';
import {
  BRIDGE_PATH,
  MAX_MESSAGE_BYTES,
  MESSAGE_TYPE,
  PEER_ROLE,
  PI_ORIGIN,
  PROTOCOL_VERSION,
  parseSelection,
  type SessionDescriptor,
  SessionDescriptorSchema,
} from './model.ts';
import type { PairingIdentity } from './pairing.ts';

const MAX_PEERS = 20;
const REQUEST_TIMEOUT_MS = 10_000;
const MIN_SELECTION_INTERVAL_MS = 300;
const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/u;
interface Peer {
  role?: string;
  session?: SessionDescriptor;
  lastSelectionAt: number;
}
interface Delivery {
  browser: WebSocket;
  pi: WebSocket;
  id: string;
  revision: string;
  timer: NodeJS.Timeout;
}
export interface LocalBroker {
  close(): Promise<void>;
}

export async function startBroker({
  identity,
  onError,
}: {
  readonly identity: PairingIdentity;
  readonly onError: (error: Error) => void;
}): Promise<LocalBroker> {
  const server = createServer((_request, response) => {
    response.writeHead(404, { 'Cache-Control': 'no-store' });
    response.end();
  });
  const sockets = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_MESSAGE_BYTES,
  });
  const peers = new Map<WebSocket, Peer>();
  const deliveries = new Map<string, Delivery>();
  const sessions = () =>
    [...peers.values()].flatMap((peer) => (peer.session ? [peer.session] : []));
  const publish = () => {
    for (const [socket, peer] of peers) {
      if (peer.role === PEER_ROLE.browser) {
        send(socket, { type: MESSAGE_TYPE.sessions, sessions: sessions() });
      }
    }
  };
  server.on('upgrade', (request, socket, head) => {
    const origin = request.headers.origin;
    if (
      request.url !== BRIDGE_PATH ||
      typeof origin !== 'string' ||
      (origin !== PI_ORIGIN && !EXTENSION_ORIGIN.test(origin)) ||
      peers.size >= MAX_PEERS
    ) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    sockets.handleUpgrade(request, socket, head, (connection) =>
      sockets.emit('connection', connection, origin),
    );
  });
  sockets.on('connection', (socket: WebSocket, origin: string) => {
    const peer: Peer = { lastSelectionAt: 0 };
    peers.set(socket, peer);
    const authenticationTimeout = setTimeout(
      () => socket.terminate(),
      REQUEST_TIMEOUT_MS,
    );
    authenticationTimeout.unref();
    socket.on('error', onError);
    socket.on('close', () => {
      clearTimeout(authenticationTimeout);
      peers.delete(socket);
      for (const [requestId, delivery] of deliveries) {
        if (delivery.pi === socket || delivery.browser === socket) {
          clearTimeout(delivery.timer);
          deliveries.delete(requestId);
          if (delivery.browser !== socket) {
            send(delivery.browser, {
              type: MESSAGE_TYPE.error,
              id: delivery.id,
              message:
                'The destination session disconnected. Select the element again.',
            });
          }
        }
      }
      publish();
    });
    socket.on('message', (bytes, binary) => {
      let selectionId: string | undefined;
      try {
        const message = parseEnvelope(bytes.toString(), binary);
        if (!peer.role) {
          const expectedRole =
            origin === PI_ORIGIN ? PEER_ROLE.pi : PEER_ROLE.browser;
          if (
            message.type !== MESSAGE_TYPE.authenticate ||
            message.version !== PROTOCOL_VERSION ||
            message.role !== expectedRole ||
            !matchesSecret(message.token, identity.token)
          ) {
            socket.close(1008, 'Invalid pairing');
            return;
          }
          peer.role = expectedRole;
          clearTimeout(authenticationTimeout);
          send(socket, {
            type: MESSAGE_TYPE.ready,
            version: PROTOCOL_VERSION,
            sessions: sessions(),
          });
          return;
        }
        if (message.type === MESSAGE_TYPE.ping) {
          send(socket, { type: MESSAGE_TYPE.pong });
          return;
        }
        if (peer.role === PEER_ROLE.pi) {
          if (
            message.type === MESSAGE_TYPE.register &&
            Check(SessionDescriptorSchema, message.session)
          ) {
            const registeredSession = message.session;
            if (peer.session && peer.session.id !== registeredSession.id) {
              throw new Error(
                'A Pi connection cannot replace another instance.',
              );
            }
            if (
              [...peers.values()].some(
                (other) =>
                  other !== peer && other.session?.id === registeredSession.id,
              )
            ) {
              throw new Error('The Pi instance is already registered.');
            }
            peer.session = registeredSession;
            send(socket, {
              type: MESSAGE_TYPE.register,
              revision: peer.session.revision,
            });
            publish();
            return;
          }
          if (
            message.type === MESSAGE_TYPE.result &&
            typeof message.requestId === 'string'
          ) {
            const delivery = deliveries.get(message.requestId);
            if (!delivery || delivery.pi !== socket) {
              throw new Error('Unknown selection receipt.');
            }
            clearTimeout(delivery.timer);
            deliveries.delete(message.requestId);
            const stale = peer.session?.revision !== delivery.revision;
            send(
              delivery.browser,
              typeof message.error === 'string' || stale
                ? {
                  type: MESSAGE_TYPE.error,
                  id: delivery.id,
                  message: stale
                    ? 'The session changed. Select the element again.'
                    : String(message.error).slice(0, 500),
                }
                : {
                  type: MESSAGE_TYPE.received,
                  id: delivery.id,
                  candidates: message.candidates,
                },
            );
            return;
          }
          throw new Error('Invalid Pi message.');
        }
        if (message.type !== MESSAGE_TYPE.selection) {
          throw new Error(
            'Choose a destination session in the browser companion.',
          );
        }
        const selection = parseSelection(message.selection);
        selectionId = selection.id;
        if (!Check(SessionDescriptorSchema, message.target)) {
          throw new Error(
            'Choose a destination session in the browser companion.',
          );
        }
        const target = message.target;
        const destination = [...peers.entries()].find(
          ([, entry]) =>
            entry.session?.id === target.id &&
            entry.session.revision === target.revision,
        );
        if (!destination) {
          throw new Error(
            'The destination session changed. Select the element again.',
          );
        }
        if (
          Date.now() - peer.lastSelectionAt < MIN_SELECTION_INTERVAL_MS ||
          deliveries.size >= 128
        ) {
          throw new Error(
            'Pi is still processing selections. Try again shortly.',
          );
        }
        peer.lastSelectionAt = Date.now();
        const requestId = randomUUID();
        const timer = setTimeout(() => {
          deliveries.delete(requestId);
          send(socket, {
            type: MESSAGE_TYPE.error,
            id: selection.id,
            message:
              'The destination session did not respond. Select the element again.',
          });
        }, REQUEST_TIMEOUT_MS);
        timer.unref();
        deliveries.set(requestId, {
          browser: socket,
          pi: destination[0],
          id: selection.id,
          revision: target.revision,
          timer,
        });
        send(destination[0], {
          type: MESSAGE_TYPE.deliver,
          requestId,
          revision: target.revision,
          selection,
        });
      } catch (cause) {
        const error =
          cause instanceof Error
            ? cause
            : new Error('Cannot route browser selection.', { cause });
        send(socket, {
          type: MESSAGE_TYPE.error,
          id: selectionId,
          message: error.message,
        });
        if (!peer.role) {
          socket.close(1008, 'Invalid pairing');
        }
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(identity.port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  server.on('error', onError);
  let closing: Promise<void> | undefined;
  return {
    close() {
      closing ??= new Promise<void>((resolve, reject) => {
        for (const delivery of deliveries.values()) {
          clearTimeout(delivery.timer);
        }
        deliveries.clear();
        for (const socket of sockets.clients) {
          socket.terminate();
        }
        sockets.close();
        server.close((error) => (error ? reject(error) : resolve()));
      });
      return closing;
    },
  };
}

function matchesSecret(token: unknown, secret: string): boolean {
  return (
    typeof token === 'string' &&
    /^[a-f0-9]{64}$/u.test(token) &&
    timingSafeEqual(Buffer.from(token), Buffer.from(secret))
  );
}
