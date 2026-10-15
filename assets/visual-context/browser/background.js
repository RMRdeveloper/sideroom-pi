importScripts('destinations.js');

const PROTOCOL_VERSION = 3;
const BRIDGE_PATH = '/sideroom-visual-context';
const HEARTBEAT_MS = 20_000;
const RESPONSE_TIMEOUT_MS = 10_000;
const RETRY_MS = 2_000;
const RETRY_ALARM = 'sideroom-reconnect';
const MAX_INSTALLATIONS = 4;
const MAX_PENDING_RECEIPTS = 8;
const MAX_MESSAGE_BYTES = 8_192;
const INSPECTOR_COMMAND = 'toggle-inspector';
const IDLE_TITLE = 'Select an element for Pi';
const ACTIVE_TITLE =
  'Selecting elements for Pi. Press Escape or the selection shortcut to stop.';
let inspectorCommands = Promise.resolve();
const MESSAGE = {
  authenticate: 'authenticate',
  ready: 'ready',
  sessions: 'sessions',
  selection: 'selection',
  received: 'received',
  error: 'error',
  ping: 'ping',
};
const WAITING_NOTICE = 'Waiting for Pi. Reconnection is automatic.';
const PAUSED_NOTICE = 'Disconnected. Your authorizations are remembered.';
const activeTabs = new Map();
const receipts = new Map();
const connections = new Map();
let paused = false;
const destinations = createDestinations();
let lastAddress = '';
let lastNotice = 'Pair once with each Pi installation to select elements.';
const isConnected = () =>
  [...connections.values()].some((entry) => entry.connected);
const availableSessions = () =>
  [...connections.values()].flatMap((entry) => entry.sessions);

function parseUrl(address, failureMessage) {
  try {
    return new URL(address);
  } catch (cause) {
    throw new Error(failureMessage, { cause });
  }
}

function parsePairingAddress(address) {
  const uri = parseUrl(
    address.trim(),
    'Paste the local pairing address shown by Pi (F7).',
  );
  if (
    uri.protocol !== 'ws:' ||
    !['127.0.0.1', 'localhost'].includes(uri.hostname) ||
    !uri.port ||
    uri.pathname !== BRIDGE_PATH ||
    uri.search ||
    uri.username ||
    uri.password ||
    !/^#[a-f0-9]{64}$/u.test(uri.hash)
  ) {
    throw new Error('Paste the local pairing address shown by Pi (F7).');
  }
  const token = uri.hash.slice(1);
  uri.hash = '';
  return { endpoint: uri.href, token };
}

async function sendToTab(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (cause) {
    lastNotice = `Inspector stopped: ${cause.message}`;
    activeTabs.delete(tabId);
  }
}

function encodeSelectionFrame(selection, target) {
  const frame = JSON.stringify({ type: MESSAGE.selection, selection, target });
  if (new TextEncoder().encode(frame).byteLength > MAX_MESSAGE_BYTES) {
    throw new Error(
      'The selected element exceeds the message limit. Select a smaller element.',
    );
  }
  return frame;
}

async function notifyReceipt({ endpoint, selectionId, notice }) {
  const receipt = receipts.get(selectionId);
  if (!receipt || receipt.endpoint !== endpoint) {
    return;
  }
  receipts.delete(selectionId);
  await sendToTab(receipt.tabId, { action: 'receipt', message: notice });
}

async function showInspectorIndicator(tabId, { text, title }) {
  await chrome.action.setBadgeBackgroundColor({ tabId, color: '#ffb340' });
  await chrome.action.setBadgeText({ tabId, text });
  await chrome.action.setTitle({ tabId, title });
}

async function stopInspector(tabId) {
  activeTabs.delete(tabId);
  await sendToTab(tabId, { action: 'stop' });
  await showInspectorIndicator(tabId, { text: '', title: IDLE_TITLE });
}

async function stopInspectors() {
  const tabIds = [...activeTabs.keys()];
  activeTabs.clear();
  receipts.clear();
  for (const tabId of tabIds) {
    await stopInspector(tabId);
  }
}

async function startInspector(tab) {
  const target = destinations.current();
  if (!target || !isConnected()) {
    throw new Error('Choose an available Pi session first.');
  }
  if (!tab?.id || !/^https?:\/\//u.test(tab.url ?? '')) {
    throw new Error('Open the web page you want to inspect.');
  }
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js'],
  });
  const commands = await chrome.commands.getAll();
  const shortcut = commands.find(
    (command) => command.name === INSPECTOR_COMMAND,
  )?.shortcut;
  if (destinations.current() !== target) {
    throw new Error('The destination changed. Start the inspector again.');
  }
  activeTabs.set(tab.id, target);
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'start', shortcut });
    await showInspectorIndicator(tab.id, { text: 'ON', title: ACTIVE_TITLE });
  } catch (cause) {
    await stopInspector(tab.id);
    throw cause;
  }
}

async function toggleInspector(commandTab) {
  let tab = commandTab;
  try {
    await initialized;
    if (!tab) {
      [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    }
    if (tab?.id && activeTabs.has(tab.id)) {
      await stopInspector(tab.id);
      return;
    }
    await startInspector(tab);
  } catch (cause) {
    lastNotice = `${cause.message} Open the Sideroom extension for details.`;
    await showInspectorIndicator(tab?.id, { text: '!', title: lastNotice });
  }
}

function updateSessions(available) {
  const previous = destinations.current();
  destinations.update(available);
  const selected = destinations.current();
  if (
    previous?.id !== selected?.id ||
    previous?.revision !== selected?.revision
  ) {
    void stopInspectors().catch((cause) => {
      console.error('Sideroom could not stop its inspectors:', cause);
    });
  }
  lastNotice = selected
    ? `Connected to ${selected.name}.`
    : destinations.all().length
      ? 'Choose which Pi session receives your selections.'
      : WAITING_NOTICE;
}

function closeConnection(entry) {
  const previous = entry.socket;
  entry.socket = undefined;
  entry.connected = false;
  entry.sessions = [];
  clearInterval(entry.heartbeat);
  clearTimeout(entry.retry);
  entry.cancel?.(new Error('The connection was closed.'));
  entry.cancel = undefined;
  previous?.close();
}

async function disconnect() {
  for (const entry of connections.values()) {
    closeConnection(entry);
  }
  destinations.clear();
  await stopInspectors();
}

function scheduleReconnect(entry) {
  if (paused || entry.blocked || connections.get(entry.endpoint) !== entry) {
    return;
  }
  clearTimeout(entry.retry);
  entry.retry = setTimeout(() => {
    void reconnect(entry);
  }, RETRY_MS);
  // Alarms wake the worker after it has been suspended while Pi is closed.
  void chrome.alarms.create(RETRY_ALARM, { periodInMinutes: 1 });
}

async function openConnection(entry) {
  closeConnection(entry);
  const socket = new WebSocket(entry.endpoint);
  entry.socket = socket;
  await new Promise((resolve, reject) => {
    entry.cancel = reject;
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(WAITING_NOTICE));
    }, RESPONSE_TIMEOUT_MS);
    socket.onopen = () =>
      socket.send(
        JSON.stringify({
          type: MESSAGE.authenticate,
          role: 'browser',
          version: PROTOCOL_VERSION,
          token: entry.token,
        }),
      );
    socket.onmessage = async (event) => {
      if (entry.socket !== socket) {
        return;
      }
      try {
        const message = JSON.parse(event.data);
        if (message.type === MESSAGE.ready) {
          if (message.version !== PROTOCOL_VERSION) {
            throw new Error('Reload the updated Sideroom browser extension.');
          }
          clearTimeout(timeout);
          entry.connected = true;
          entry.cancel = undefined;
          entry.sessions = message.sessions;
          updateSessions(availableSessions());
          if (
            [...connections.values()].every(
              (connection) => connection.connected,
            )
          ) {
            await chrome.alarms.clear(RETRY_ALARM);
          }
          entry.heartbeat = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: MESSAGE.ping }));
            }
          }, HEARTBEAT_MS);
          resolve();
        }
        if (message.type === MESSAGE.sessions) {
          entry.sessions = message.sessions;
          updateSessions(availableSessions());
        }
        if (message.type === MESSAGE.received) {
          lastNotice = `${String(message.candidates)} source candidates. Review in Pi (F7).`;
          await notifyReceipt({
            endpoint: entry.endpoint,
            selectionId: message.id,
            notice: lastNotice,
          });
        }
        if (message.type === MESSAGE.error) {
          lastNotice = message.message;
          if (typeof message.id === 'string') {
            await notifyReceipt({
              endpoint: entry.endpoint,
              selectionId: message.id,
              notice: lastNotice,
            });
            return;
          }
          // Older brokers and connection failures can only identify the installation.
          for (const selectionId of [...receipts.keys()]) {
            await notifyReceipt({
              endpoint: entry.endpoint,
              selectionId,
              notice: lastNotice,
            });
          }
        }
      } catch (cause) {
        lastNotice = `Invalid bridge response: ${cause.message}`;
        clearTimeout(timeout);
        socket.close();
        reject(new Error(lastNotice));
      }
    };
    socket.onerror = () => {
      clearTimeout(timeout);
      reject(
        new Error(
          'Waiting for Pi. Windows must be able to reach WSL localhost when using Pi in WSL.',
        ),
      );
    };
    socket.onclose = (event) => {
      clearTimeout(timeout);
      if (entry.socket !== socket) {
        return;
      }
      entry.socket = undefined;
      entry.connected = false;
      entry.sessions = [];
      entry.blocked = event?.code === 1008;
      clearInterval(entry.heartbeat);
      for (const [selectionId, receipt] of receipts) {
        if (receipt.endpoint === entry.endpoint) {
          receipts.delete(selectionId);
        }
      }
      updateSessions(availableSessions());
      reject(
        new Error(
          entry.blocked
            ? 'Authorization rejected. Pair that installation again from F7.'
            : WAITING_NOTICE,
        ),
      );
      scheduleReconnect(entry);
    };
  });
}

async function reconnect(entry) {
  if (paused || entry.blocked || entry.connected) {
    return;
  }
  if (!entry.attempt) {
    entry.attempt = openConnection(entry)
      .catch((cause) => {
        if (!destinations.current()) {
          lastNotice = cause.message;
        }
        scheduleReconnect(entry);
      })
      .finally(() => {
        entry.attempt = undefined;
      });
  }
  await entry.attempt;
}

function remember(address) {
  const pairing = parsePairingAddress(address);
  const existing = connections.get(pairing.endpoint);
  if (existing && existing.token === pairing.token) {
    existing.blocked = false;
    return existing;
  }
  if (!existing && connections.size >= MAX_INSTALLATIONS) {
    throw new Error(
      'Four installations are already authorized. Forget them before adding another.',
    );
  }
  if (existing) {
    closeConnection(existing);
  }
  const entry = {
    ...pairing,
    address: address.trim(),
    connected: false,
    sessions: [],
    blocked: false,
  };
  connections.set(entry.endpoint, entry);
  return entry;
}

const initialized = chrome.storage.local
  .setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })
  .then(async () => {
    const saved = await chrome.storage.local.get([
      'pairingAddresses',
      'pairingAddress',
      'paused',
    ]);
    const addresses =
      saved.pairingAddresses ??
      (saved.pairingAddress ? [saved.pairingAddress] : []);
    paused = saved.paused === true;
    for (const address of addresses) {
      const entry = remember(address);
      lastAddress = address;
      void reconnect(entry);
    }
    if (paused) {
      lastNotice = PAUSED_NOTICE;
    }
  });

async function handleMessage(message, sender) {
  if (sender.id !== chrome.runtime.id) {
    throw new Error('Unknown inspector sender.');
  }
  await initialized;
  const fromPopup = sender.url === chrome.runtime.getURL('popup.html');
  if (!fromPopup) {
    const target = activeTabs.get(sender.tab?.id);
    if (message.action === 'stopped') {
      if (sender.tab?.id) {
        activeTabs.delete(sender.tab.id);
        await showInspectorIndicator(sender.tab.id, {
          text: '',
          title: IDLE_TITLE,
        });
      }
      return { ok: true };
    }
    if (message.action !== 'selection' || !target || !isConnected()) {
      throw new Error('Connect to Pi and start the inspector first.');
    }
    const selected = destinations.current();
    if (target.id !== selected?.id || target.revision !== selected?.revision) {
      throw new Error('The destination changed. Start the inspector again.');
    }
    const entry = [...connections.values()].find(
      (connection) =>
        connection.connected &&
        connection.sessions.some(
          (session) =>
            session.id === target.id && session.revision === target.revision,
        ),
    );
    if (!entry || entry.socket?.readyState !== WebSocket.OPEN) {
      throw new Error('The destination is no longer available.');
    }
    if (receipts.size >= MAX_PENDING_RECEIPTS) {
      throw new Error('Pi is still processing selections. Try again shortly.');
    }
    const page = parseUrl(
      sender.tab.url,
      'The selected page has an invalid address.',
    );
    const selection = {
      ...message.selection,
      page: `${page.origin}${page.pathname}`,
    };
    const frame = encodeSelectionFrame(selection, target);
    receipts.set(selection.id, {
      tabId: sender.tab.id,
      endpoint: entry.endpoint,
    });
    try {
      entry.socket.send(frame);
    } catch (cause) {
      receipts.delete(selection.id);
      throw new Error('Cannot send the selected element to Pi.', { cause });
    }
    return { ok: true };
  }
  if (message.action === 'status') {
    for (const entry of connections.values()) {
      void reconnect(entry);
    }
    return {
      ok: true,
      connected: isConnected(),
      notice: lastNotice,
      address: lastAddress,
      sessions: destinations.all(),
      selectedId: destinations.current()?.id ?? '',
      paused,
      installations: connections.size,
    };
  }
  if (message.action === 'connect') {
    const entry = remember(message.address);
    lastAddress = entry.address;
    paused = false;
    await chrome.storage.local.set({
      pairingAddresses: [...connections.values()].map(
        (connection) => connection.address,
      ),
      paused,
    });
    await chrome.storage.local.remove('pairingAddress');
    await reconnect(entry);
    for (const connection of connections.values()) {
      if (connection !== entry) {
        void reconnect(connection);
      }
    }
    return {
      ok: true,
      connected: isConnected(),
      notice: lastNotice,
      sessions: destinations.all(),
      selectedId: destinations.current()?.id ?? '',
      address: lastAddress,
    };
  }
  if (message.action === 'disconnect' || message.action === 'forget') {
    paused = true;
    await disconnect();
    await chrome.alarms.clear(RETRY_ALARM);
    if (message.action === 'forget') {
      connections.clear();
      lastAddress = '';
      await chrome.storage.local.remove(['pairingAddress', 'pairingAddresses']);
    }
    await chrome.storage.local.set({ paused });
    lastNotice = lastAddress
      ? PAUSED_NOTICE
      : 'Authorizations forgotten. Pair again from F7.';
    return {
      ok: true,
      connected: false,
      notice: lastNotice,
      address: lastAddress,
      sessions: [],
      selectedId: '',
    };
  }
  if (message.action === 'choose') {
    destinations.choose(message.id);
    const destination = destinations.current();
    await stopInspectors();
    lastNotice = `Connected to ${destination.name}.`;
    return {
      ok: true,
      connected: isConnected(),
      notice: lastNotice,
      sessions: destinations.all(),
      selectedId: destination.id,
    };
  }
  if (message.action === 'inspect') {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    await startInspector(tab);
    return { ok: true };
  }
  throw new Error('Unknown inspector action.');
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  handleMessage(message, sender).then(respond, (cause) => {
    lastNotice = cause.message;
    respond({ ok: false, message: lastNotice });
  });
  return true;
});
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== INSPECTOR_COMMAND) {
    return;
  }
  inspectorCommands = inspectorCommands
    .then(() => toggleInspector(tab))
    .catch((cause) => {
      console.error('Sideroom could not update its inspector:', cause);
    });
  return inspectorCommands;
});
chrome.tabs.onRemoved.addListener((tabId) => activeTabs.delete(tabId));
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === 'loading' && activeTabs.has(tabId)) {
    void stopInspector(tabId).catch((cause) => {
      console.error(
        'Sideroom could not clear its inspector after navigation:',
        cause,
      );
    });
  }
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RETRY_ALARM) {
    void initialized
      .then(() => Promise.all([...connections.values()].map(reconnect)))
      .catch((cause) => {
        lastNotice = cause.message;
      });
  }
});
