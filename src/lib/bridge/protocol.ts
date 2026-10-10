// the wire protocol between the brainbridge server and the brainotes and
// texbrain tabs. the server and texbrain have the same file, keep them identical

export const PROTOCOL_VERSION = 1;
export const DEFAULT_PORT = 7332;

export type AppName = 'brainotes' | 'texbrain';

// tab -> server, first message after the socket opens
export interface HelloMessage {
  type: 'hello';
  protocol: number;
  app: AppName;
  version: string;
  url: string;
}

// tab -> server, the answer to a call
export interface ResultMessage {
  type: 'result';
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

// tab -> server, something happened that nobody asked about (another notebook is open)
export interface EventMessage {
  type: 'event';
  name: string;
  data?: unknown;
}

// server -> tab, run a command and answer with a result carrying the same id
export interface CallMessage {
  type: 'call';
  id: string;
  cmd: string;
  args: Record<string, unknown>;
}

// server -> tab, the answer to hello
export interface WelcomeMessage {
  type: 'welcome';
  protocol: number;
  server: string;
  version: string;
}

// server -> tab, another tab of the same app connected and took over
export interface ReplacedMessage {
  type: 'replaced';
}

export type TabMessage = HelloMessage | ResultMessage | EventMessage;
export type ServerMessage = CallMessage | WelcomeMessage | ReplacedMessage;
