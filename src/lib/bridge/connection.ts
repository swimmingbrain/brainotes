// the tab's end of the bridge: one websocket to the brainbridge server on this
// machine, calls in, results out. nothing here leaves the machine, the socket
// only ever points at the loopback address

import { addToast, starting } from '$lib/stores/app';
import { preferences } from '$lib/stores/preferences';
import { version } from '$lib/version';
import { runCommand } from './commands';
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

function send(message: TabMessage): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
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
      bridge.update((b) => ({ ...b, state: 'connected', port }));
      if (!announced) addToast('Bridge connected', 'success');
      announced = true;
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
  bridge.update((b) => ({ ...b, state: 'off', lastAction: null }));
  if (open) addToast('Bridge disconnected', 'info');
}

// wires the bridge to the preference: on means keep a connection up, off
// means drop it
export function installBridge(): () => void {
  const unsubscribe = preferences.subscribe((p) => {
    bridge.update((b) => ({ ...b, on: p.bridge, port: p.bridgePort }));
    if (p.bridge) {
      if (!wanted || p.bridgePort !== port) {
        wanted = true;
        port = p.bridgePort;
        connect();
      }
    } else if (wanted) {
      wanted = false;
      disconnect();
    }
  });
  return () => {
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
  preferences.update((p) => ({ ...p, bridge: false }));
}
