const form = document.querySelector('#pairing-form');
const address = document.querySelector('#address');
const status = document.querySelector('#status');
const inspect = document.querySelector('#inspect');
const disconnect = document.querySelector('#disconnect');
const forget = document.querySelector('#forget');
const destination = document.querySelector('#destination');
const connect = document.querySelector('#connect');
// Edge keeps the Chromium shortcut page under its own scheme; every other
// Chromium browser the companion supports answers on chrome://.
const SHORTCUT_PAGE = navigator.userAgent.includes('Edg/')
  ? 'edge://extensions/shortcuts'
  : 'chrome://extensions/shortcuts';
let busy = false;
let pairingShown = false;

function showStatus(receipt) {
  status.textContent = receipt.notice ?? receipt.message;
  if (receipt.connected !== undefined) {
    inspect.disabled = !receipt.connected || !receipt.selectedId;
    disconnect.disabled = !receipt.connected;
  }
  if (receipt.address !== undefined) {
    if (!pairingShown) {
      document.querySelector('#pairing-details').open = !receipt.address;
      pairingShown = true;
    }
    if (document.activeElement !== address) {
      address.value = receipt.address;
    }
    forget.disabled = !receipt.address;
  }
  if (receipt.sessions) {
    destination.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = receipt.sessions.length
      ? 'Choose a Pi session…'
      : 'Waiting for Pi…';
    destination.append(placeholder);
    for (const session of receipt.sessions) {
      const option = document.createElement('option');
      option.value = session.id;
      option.textContent = `${session.environment} · ${session.name} · ${session.project}`;
      destination.append(option);
    }
    destination.value = receipt.selectedId;
    destination.disabled = !receipt.connected || !receipt.sessions.length;
  }
}

async function request(message) {
  const receipt = await chrome.runtime.sendMessage(message);
  if (!receipt.ok) {
    throw new Error(receipt.message);
  }
  return receipt;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  busy = true;
  connect.disabled = true;
  status.textContent = 'Connecting…';
  try {
    showStatus(await request({ action: 'connect', address: address.value }));
  } catch (cause) {
    showStatus({ message: cause.message, connected: false });
  } finally {
    busy = false;
    connect.disabled = false;
  }
});

destination.addEventListener('change', async () => {
  busy = true;
  try {
    showStatus(await request({ action: 'choose', id: destination.value }));
  } catch (cause) {
    showStatus({ message: cause.message });
  } finally {
    busy = false;
  }
});

inspect.addEventListener('click', async () => {
  try {
    await request({ action: 'inspect' });
    window.close();
  } catch (cause) {
    showStatus({ message: cause.message });
  }
});

for (const button of [disconnect, forget]) {
  button.addEventListener('click', async () => {
    busy = true;
    try {
      showStatus(
        await request({ action: button === forget ? 'forget' : 'disconnect' }),
      );
      if (button === forget) {
        address.value = '';
        document.querySelector('#pairing-details').open = true;
      }
    } catch (cause) {
      showStatus({ message: cause.message });
    } finally {
      busy = false;
    }
  });
}

async function refresh() {
  if (busy) {
    return;
  }
  try {
    showStatus(await request({ action: 'status' }));
  } catch (cause) {
    showStatus({ message: cause.message, connected: false });
  }
}
async function showShortcut() {
  const hint = document.querySelector('#shortcut-hint');
  try {
    const commands = await chrome.commands.getAll();
    const shortcut = commands.find(
      (command) => command.name === 'toggle-inspector',
    )?.shortcut;
    hint.textContent = shortcut
      ? `${shortcut} starts or stops selection. Escape also exits. Change it in ${SHORTCUT_PAGE}.`
      : `No selection shortcut is assigned. Set one in ${SHORTCUT_PAGE}. Escape exits selection.`;
  } catch (cause) {
    hint.textContent = `Could not read the shortcut: ${cause.message}. Check ${SHORTCUT_PAGE}.`;
  }
}
void showShortcut();
void refresh();
const poll = setInterval(refresh, 1_000);
window.addEventListener('pagehide', () => clearInterval(poll));
