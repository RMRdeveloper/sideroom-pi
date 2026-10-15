(() => {
  const INSPECTOR_KEY = '__sideroomVisualInspector';
  if (globalThis[INSPECTOR_KEY]) {
    return;
  }
  const MAX_TEXT = 160;
  const MAX_CLASSES = 32;
  const MAX_ANCESTORS = 4;
  const SOURCE_ATTRIBUTE = 'data-insp-path';
  const MAX_SOURCE_PATH = 2_048;
  const BORDER = '#ffb340';
  let active = false;
  let root;
  let box;
  let caption;
  let exitHint = 'Esc to exit';

  function clean(text) {
    return text
      .split('')
      .map((character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
          ? ' '
          : character,
      )
      .join('')
      .replace(/\s+/gu, ' ')
      .trim()
      .slice(0, MAX_TEXT);
  }

  function describe(element) {
    return {
      tag: element.localName,
      elementId: clean(element.id ?? ''),
      classes: [...element.classList].slice(0, MAX_CLASSES).map(clean),
    };
  }

  function sourceLocation(element) {
    const marker = element.getAttribute(SOURCE_ATTRIBUTE);
    if (!marker) {
      return undefined;
    }
    const parts = marker.match(/^(.*):(\d+):(\d+):([^:]+)$/u);
    if (
      !parts?.[1] ||
      parts[1].length > MAX_SOURCE_PATH ||
      [...parts[1]].some(
        (character) =>
          character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      )
    ) {
      throw new Error(
        'Invalid compiler location. Refresh the development page.',
      );
    }
    const line = Number(parts[2]);
    const column = Number(parts[3]);
    if (
      !Number.isSafeInteger(line) ||
      !Number.isSafeInteger(column) ||
      line < 1 ||
      column < 1 ||
      line > 1_000_000 ||
      column > 1_000_000
    ) {
      throw new Error(
        'Invalid compiler position. Refresh the development page.',
      );
    }
    return { path: parts[1], line, column };
  }

  function visibleText(element) {
    if (element.closest('input,textarea,select,[contenteditable]')) {
      return '';
    }
    const clone = element.cloneNode(true);
    for (const child of clone.querySelectorAll(
      'script,style,input,textarea,select,[contenteditable],[hidden]',
    )) {
      child.remove();
    }
    return clean(clone.textContent ?? '');
  }

  function selectedElement(event) {
    return event
      .composedPath()
      .find((node) => node instanceof Element && node !== root);
  }

  function highlight(event) {
    const element = selectedElement(event);
    if (!active || !element || element === document.documentElement) {
      return;
    }
    const bounds = element.getBoundingClientRect();
    Object.assign(box.style, {
      left: `${bounds.left}px`,
      top: `${bounds.top}px`,
      width: `${bounds.width}px`,
      height: `${bounds.height}px`,
    });
    caption.textContent = `${element.localName} · click to attach · ${exitHint}`;
  }

  function intercept(event) {
    if (active) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  async function select(event) {
    if (!active || !event.isTrusted) {
      return;
    }
    intercept(event);
    const element = selectedElement(event);
    if (!element || element === root) {
      return;
    }
    const ancestors = [];
    let parent = element.parentElement;
    while (parent && ancestors.length < MAX_ANCESTORS) {
      ancestors.push(describe(parent));
      parent = parent.parentElement;
    }
    caption.textContent = 'Sending selection to Pi…';
    try {
      const selection = {
        id: crypto.randomUUID(),
        page: `${location.origin}${location.pathname}`,
        element: describe(element),
        text: visibleText(element),
        ancestors,
        source: sourceLocation(element),
      };
      const response = await chrome.runtime.sendMessage({
        action: 'selection',
        selection,
      });
      if (!response.ok) {
        throw new Error(response.message);
      }
    } catch (cause) {
      if (caption) {
        caption.textContent = cause.message;
      }
    }
  }

  function keydown(event) {
    if (event.key === 'Escape') {
      intercept(event);
      stop();
      chrome.runtime.sendMessage({ action: 'stopped' }).catch((cause) => {
        console.error('Sideroom inspector could not report its exit:', cause);
      });
    }
  }

  function start(shortcut) {
    stop();
    exitHint = shortcut ? `Esc or ${shortcut} to exit` : 'Esc to exit';
    active = true;
    root = document.createElement('div');
    root.setAttribute('data-sideroom-inspector', '');
    Object.assign(root.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483647',
      pointerEvents: 'none',
    });
    const shadow = root.attachShadow({ mode: 'closed' });
    box = document.createElement('div');
    Object.assign(box.style, {
      position: 'fixed',
      boxSizing: 'border-box',
      border: `2px solid ${BORDER}`,
      background: 'rgba(255,179,64,.08)',
    });
    caption = document.createElement('div');
    caption.setAttribute('role', 'status');
    caption.setAttribute('aria-live', 'polite');
    caption.textContent = `Select an element · ${exitHint}`;
    Object.assign(caption.style, {
      position: 'fixed',
      bottom: '16px',
      left: '16px',
      maxWidth: 'calc(100vw - 32px)',
      padding: '10px 14px',
      background: '#131211',
      color: '#f2ede3',
      border: `1px solid ${BORDER}`,
      font: '13px ui-monospace, monospace',
    });
    shadow.append(box, caption);
    document.documentElement.append(root);
    window.addEventListener('pointermove', highlight, true);
    window.addEventListener('pointerdown', intercept, true);
    window.addEventListener('mousedown', intercept, true);
    window.addEventListener('click', select, true);
    window.addEventListener('keydown', keydown, true);
    window.addEventListener('pagehide', stop);
  }

  function stop() {
    active = false;
    root?.remove();
    root = undefined;
    box = undefined;
    caption = undefined;
    window.removeEventListener('pointermove', highlight, true);
    window.removeEventListener('pointerdown', intercept, true);
    window.removeEventListener('mousedown', intercept, true);
    window.removeEventListener('click', select, true);
    window.removeEventListener('keydown', keydown, true);
    window.removeEventListener('pagehide', stop);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'start') {
      start(message.shortcut);
    }
    if (message.action === 'stop') {
      stop();
    }
    if (message.action === 'receipt' && caption) {
      caption.textContent = message.message;
    }
  });
  globalThis[INSPECTOR_KEY] = { stop };
})();
