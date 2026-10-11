// the tab's end of the bridge: one websocket to the brainbridge server on this
// machine, calls in, results out. nothing here leaves the machine, the socket
// only ever points at the loopback address

import { derived, get, writable } from 'svelte/store';
import { addToast, notebookId, notebookName, notebookTex, starting } from '$lib/stores/app';
import { preferences } from '$lib/stores/preferences';
import { version } from '$lib/version';
import { describe, runCommand } from './commands';
import { PROTOCOL_VERSION, type CallMessage, type ServerMessage, type TabMessage } from './protocol';
import { bridge } from './state';

let socket: WebSocket | null = null;
let wanted = false;
let port = 0;
let attempts = 0;
let retry: ReturnType<typeof setTimeout> | null = null;
// set when another tab took the connection, so this one stops trying
let replaced = false;
let announced = false;
let documentQueued = false;
// a public site needs the browser's permission to reach 127.0.0.1 and chrome
// asks for it while the socket waits. a page served from this machine is never asked
const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$/;
const HINT_AFTER = 4000;
let hinted = false;
let hint: ReturnType<typeof setTimeout> | null = null;
// ?bridge in the address switches it on for this tab only, with this port.
// null means the tab follows the preference
const tabPort = writable<number | null>(null);

function validPort(n: number): boolean {
  return Number.isInteger(n) && n > 0 && n < 65536;
}

function send(message: TabMessage): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

// something the server did not ask about, only while it listens
export function bridgeEvent(name: string, data: unknown): void {
  if (get(bridge).state === 'connected') send({ type: 'event', name, data });
}

// a switch of notebook changes id, name and link one after the other, one event says it all
function sendDocument(): void {
  if (documentQueued) return;
  documentQueued = true;
  queueMicrotask(() => {
    documentQueued = false;
    bridgeEvent('document', { notebook: describe() });
  });
}

// a call that comes in while the tab still opens the last notebook waits for it
function started(): Promise<void> {
  return new Promise((resolve) => {
    const off = starting.subscribe((busy) => {
      if (busy) return;
      queueMicrotask(() => off());
      resolve();
    });
  });
}

async function handleCall(call: CallMessage): Promise<void> {
  const name = String(call.cmd).replace(/_/g, ' ');
  bridge.update((b) => ({ ...b, calls: b.calls + 1, lastAction: `${name}...` }));
  try {
    await started();
    const result = await runCommand(call.cmd, call.args ?? {});
    send({ type: 'result', id: call.id, ok: true, result });
    bridge.update((b) => ({ ...b, lastAction: name }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    send({ type: 'result', id: call.id, ok: false, error: message });
    bridge.update((b) => ({ ...b, lastAction: `${name} failed: ${message}` }));
  }
}

// once per tab, a few seconds into waiting
function startHint(): void {
  if (hinted || hint || LOOPBACK.test(location.hostname)) return;
  hint = setTimeout(() => {
    hint = null;
    if (get(bridge).state !== 'connecting') return;
    hinted = true;
    addToast('If the browser asks whether this site may connect to apps on this device, allow it, the bridge needs that', 'info', 10000);
  }, HINT_AFTER);
}

function stopHint(): void {
  if (hint) clearTimeout(hint);
  hint = null;
}

function onMessage(event: MessageEvent): void {
  let message: ServerMessage;
  try {
    message = JSON.parse(String(event.data)) as ServerMessage;
  } catch {
    return;
  }
  switch (message?.type) {
    case 'welcome':
      attempts = 0;
      stopHint();
      bridge.update((b) => ({ ...b, state: 'connected', port }));
      if (!announced) addToast('Bridge connected', 'success');
      announced = true;
      sendDocument();
      break;
    case 'call':
      void handleCall(message);
      break;
    case 'replaced':
      replaced = true;
      addToast('Another tab took over the bridge', 'info', 5000);
      break;
  }
}

function scheduleRetry(): void {
  if (retry) clearTimeout(retry);
  const delay = Math.min(5000, 500 * 2 ** attempts);
  attempts += 1;
  retry = setTimeout(() => {
    retry = null;
    if (wanted && !replaced) connect();
  }, delay);
}

function connect(): void {
  if (retry) {
    clearTimeout(retry);
    retry = null;
  }
  if (socket) {
    socket.onclose = null;
    socket.close();
    socket = null;
  }
  replaced = false;
  bridge.update((b) => ({ ...b, state: 'connecting', port }));
  startHint();
  let ws: WebSocket;
  try {
    ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  } catch {
    scheduleRetry();
    return;
  }
  socket = ws;
  ws.onopen = () => {
    send({ type: 'hello', protocol: PROTOCOL_VERSION, app: 'brainotes', version, url: location.href });
  };
  ws.onmessage = onMessage;
  ws.onclose = (event) => {
    if (socket !== ws) return;
    socket = null;
    // 4000 is how the server says another tab took over, the message may not have made it
    if (event.code === 4000) replaced = true;
    if (wanted && !replaced) {
      bridge.update((b) => ({ ...b, state: 'connecting' }));
      scheduleRetry();
    } else {
      bridge.update((b) => ({ ...b, state: 'off' }));
    }
  };
}

function disconnect(): void {
  if (retry) {
    clearTimeout(retry);
    retry = null;
  }
  const open = socket?.readyState === WebSocket.OPEN;
  if (socket) {
    socket.onclose = null;
    socket.close();
    socket = null;
  }
  attempts = 0;
  announced = false;
  stopHint();
  bridge.update((b) => ({ ...b, state: 'off', lastAction: null }));
  if (open) addToast('Bridge disconnected', 'info');
}

// wires the bridge to the preference: on means keep a connection up, off
// means drop it. opening the app with ?bridge (or ?bridge=PORT) switches it
// on for this tab without touching the preference, links from texbrain do that
export function installBridge(): () => void {
  const flag = new URL(location.href).searchParams.get('bridge');
  if (flag !== null) {
    const asked = Number(flag);
    tabPort.set(flag !== '' && validPort(asked) ? asked : get(preferences).bridgePort);
  }
  const wish = derived([preferences, tabPort], ([p, tab]) => ({ on: tab !== null || p.bridge, port: tab ?? p.bridgePort }));
  const unwatch = derived([notebookId, notebookName, notebookTex], (open) => open).subscribe(sendDocument);
  const unsubscribe = wish.subscribe((next) => {
    bridge.update((b) => ({ ...b, on: next.on, port: next.port }));
    if (next.on) {
      if (!wanted || next.port !== port) {
        wanted = true;
        port = next.port;
        connect();
      }
    } else if (wanted) {
      wanted = false;
      disconnect();
    }
  });
  return () => {
    unwatch();
    unsubscribe();
    wanted = false;
    disconnect();
  };
}

export function connectBridge(): void {
  preferences.update((p) => ({ ...p, bridge: true }));
  // after another tab took over, switching on again takes it back
  if (wanted && replaced) connect();
}

export function disconnectBridge(): void {
  tabPort.set(null);
  preferences.update((p) => ({ ...p, bridge: false }));
}

// a tab switched on by its address keeps following its own port
export function setBridgePort(next: number): void {
  if (!validPort(next)) return;
  if (get(tabPort) !== null) tabPort.set(next);
  preferences.update((p) => ({ ...p, bridgePort: next }));
}
