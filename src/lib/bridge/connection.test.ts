import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('./commands', () => ({
  describe: () => null,
  runCommand: vi.fn(async (name: string) => {
    if (name === 'status') return { notebook: null };
    if (name === 'boom') throw new Error('something broke');
    throw new Error('unknown command');
  })
}));

// a websocket the test plays the server for
class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }

  close() {
    this.readyState = 3;
  }

  open() {
    this.readyState = 1;
    this.onopen?.();
  }

  receive(message: unknown) {
    this.onmessage?.({ data: typeof message === 'string' ? message : JSON.stringify(message) });
  }

  drop(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

const WELCOME = { type: 'welcome', protocol: 1, server: 'brainbridge', version: '0.1.0' };

// fresh modules every time, the connection keeps its state at module level
async function load(href = 'http://localhost:5173/') {
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.stubGlobal('location', new URL(href));
  const connection = await import('./connection');
  const { bridge } = await import('./state');
  const { runCommand } = await import('./commands');
  const app = await import('$lib/stores/app');
  const { preferences } = await import('$lib/stores/preferences');
  app.starting.set(false);
  const toasts = () => get(app.toasts).map((t) => t.message);
  const switchOn = () => preferences.update((p) => ({ ...p, bridge: true }));
  return { connection, bridge, runCommand, app, preferences, toasts, switchOn };
}

const last = () => FakeSocket.all[FakeSocket.all.length - 1];

// the async steps of a call, without real time passing
async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

describe('the bridge connection', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    FakeSocket.all = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('stays off until it is switched on, then says hello and waits for the welcome', async () => {
    const { connection, bridge, toasts, switchOn } = await load();
    const remove = connection.installBridge();
    expect(FakeSocket.all).toHaveLength(0);
    expect(get(bridge).on).toBe(false);

    switchOn();
    const ws = last();
    expect(ws.url).toBe('ws://127.0.0.1:7332/ws');
    expect(get(bridge)).toMatchObject({ on: true, state: 'connecting', port: 7332 });
    ws.open();
    expect(ws.sent[0]).toEqual({
      type: 'hello',
      protocol: 1,
      app: 'brainotes',
      version: expect.any(String),
      url: 'http://localhost:5173/'
    });
    expect(get(bridge).state).toBe('connecting');

    ws.receive(WELCOME);
    expect(get(bridge).state).toBe('connected');
    expect(toasts()).toContain('Bridge connected');
    await settle();
    expect(ws.sent).toContainEqual({ type: 'event', name: 'document', data: { notebook: null } });
    remove();
  });

  it('answers a call with its result, or with the error as a sentence', async () => {
    const { connection, bridge, switchOn } = await load();
    const remove = connection.installBridge();
    switchOn();
    const ws = last();
    ws.open();
    ws.receive(WELCOME);

    ws.receive({ type: 'call', id: 'a', cmd: 'status', args: {} });
    await settle();
    expect(ws.sent).toContainEqual({ type: 'result', id: 'a', ok: true, result: { notebook: null } });
    expect(get(bridge).lastAction).toBe('status');

    ws.receive({ type: 'call', id: 'b', cmd: 'boom', args: {} });
    ws.receive({ type: 'call', id: 'c', cmd: 'page_image', args: {} });
    await settle();
    expect(ws.sent).toContainEqual({ type: 'result', id: 'b', ok: false, error: 'something broke' });
    expect(ws.sent).toContainEqual({ type: 'result', id: 'c', ok: false, error: 'unknown command' });
    expect(get(bridge).lastAction).toBe('page image failed: unknown command');
    expect(get(bridge).calls).toBe(3);
    remove();
  });

  it('holds a call back until the notebook from last time is open', async () => {
    const { connection, app, runCommand, switchOn } = await load();
    app.starting.set(true);
    const remove = connection.installBridge();
    switchOn();
    const ws = last();
    ws.open();
    ws.receive(WELCOME);
    ws.receive({ type: 'call', id: 'a', cmd: 'status', args: {} });
    await settle();
    expect(runCommand).not.toHaveBeenCalled();
    expect(ws.sent.some((m) => m.type === 'result')).toBe(false);

    app.starting.set(false);
    await settle();
    expect(runCommand).toHaveBeenCalledWith('status', {});
    expect(ws.sent).toContainEqual({ type: 'result', id: 'a', ok: true, result: { notebook: null } });
    remove();
  });

  it('tries again after 0.5, 1, 2, 4 and then every 5 seconds, and from the start after a welcome', async () => {
    const { connection, bridge, switchOn } = await load();
    const remove = connection.installBridge();
    switchOn();
    for (const delay of [500, 1000, 2000, 4000, 5000, 5000]) {
      const count = FakeSocket.all.length;
      last().drop();
      expect(get(bridge).state).toBe('connecting');
      vi.advanceTimersByTime(delay - 1);
      expect(FakeSocket.all).toHaveLength(count);
      vi.advanceTimersByTime(1);
      expect(FakeSocket.all).toHaveLength(count + 1);
    }
    last().open();
    last().receive(WELCOME);
    const count = FakeSocket.all.length;
    last().drop();
    vi.advanceTimersByTime(500);
    expect(FakeSocket.all).toHaveLength(count + 1);
    remove();
  });

  it('stops when another tab takes over and takes it back when switched on again', async () => {
    const { connection, bridge, toasts, switchOn } = await load();
    const remove = connection.installBridge();
    switchOn();
    last().open();
    last().receive(WELCOME);
    last().receive({ type: 'replaced' });
    last().drop(4000);
    expect(get(bridge)).toMatchObject({ on: true, state: 'off' });
    expect(toasts()).toContain('Another tab took over the bridge');
    vi.advanceTimersByTime(60000);
    expect(FakeSocket.all).toHaveLength(1);

    connection.connectBridge();
    expect(FakeSocket.all).toHaveLength(2);
    expect(get(bridge).state).toBe('connecting');

    // the close code alone says so too
    last().open();
    last().receive(WELCOME);
    last().drop(4000);
    vi.advanceTimersByTime(60000);
    expect(FakeSocket.all).toHaveLength(2);
    remove();
  });

  it('closes the socket when switched off and stops trying', async () => {
    const { connection, bridge, preferences, toasts, switchOn } = await load();
    const remove = connection.installBridge();
    switchOn();
    const ws = last();
    ws.open();
    ws.receive(WELCOME);
    connection.disconnectBridge();
    expect(ws.readyState).toBe(3);
    expect(get(bridge)).toMatchObject({ on: false, state: 'off', lastAction: null });
    expect(get(preferences).bridge).toBe(false);
    expect(toasts()).toContain('Bridge disconnected');
    vi.advanceTimersByTime(60000);
    expect(FakeSocket.all).toHaveLength(1);
    remove();
  });

  it('connects a tab opened with ?bridge=PORT to that port and leaves the preference off', async () => {
    const { connection, bridge, preferences } = await load('http://localhost:5173/?notebook=abc&bridge=7400');
    const remove = connection.installBridge();
    expect(last().url).toBe('ws://127.0.0.1:7400/ws');
    expect(get(bridge)).toMatchObject({ on: true, port: 7400 });
    expect(get(preferences).bridge).toBe(false);

    connection.setBridgePort(7401);
    expect(last().url).toBe('ws://127.0.0.1:7401/ws');
    connection.disconnectBridge();
    expect(get(bridge)).toMatchObject({ on: false, state: 'off', port: 7401 });
    remove();
  });

  it('takes the port from the preference for ?bridge without a usable number', async () => {
    for (const query of ['?bridge', '?bridge=abc', '?bridge=99999']) {
      vi.resetModules();
      FakeSocket.all = [];
      const { connection } = await load(`http://localhost:5173/${query}`);
      const remove = connection.installBridge();
      expect(last().url).toBe('ws://127.0.0.1:7332/ws');
      remove();
    }
  });

  it('shrugs off messages it cannot read', async () => {
    const { connection, bridge, switchOn } = await load();
    const remove = connection.installBridge();
    switchOn();
    const ws = last();
    ws.open();
    ws.receive('not json');
    ws.receive('null');
    ws.receive({ type: 'something new' });
    expect(get(bridge).state).toBe('connecting');
    ws.receive(WELCOME);
    expect(get(bridge).state).toBe('connected');
    remove();
  });

  it('asks once to allow the connection on a public site, never on this machine', async () => {
    const hints = (messages: string[]) => messages.filter((m) => m.includes('apps on this device')).length;

    const local = await load('http://localhost:5173/?bridge');
    const removeLocal = local.connection.installBridge();
    vi.advanceTimersByTime(30000);
    expect(hints(local.toasts())).toBe(0);
    removeLocal();

    vi.resetModules();
    const site = await load('https://notes.swimmingbrain.dev/?bridge');
    const remove = site.connection.installBridge();
    vi.advanceTimersByTime(3999);
    expect(hints(site.toasts())).toBe(0);
    vi.advanceTimersByTime(1);
    expect(hints(site.toasts())).toBe(1);
    // the toast stays up for a while, a second one would sit under it
    site.connection.disconnectBridge();
    site.connection.connectBridge();
    vi.advanceTimersByTime(5000);
    expect(hints(site.toasts())).toBe(1);
    remove();
  });
});
