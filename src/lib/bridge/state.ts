import { writable } from 'svelte/store';
import { DEFAULT_PORT } from './protocol';

export type BridgeState = 'off' | 'connecting' | 'connected';

export interface BridgeInfo {
  // switched on, by the preference or by ?bridge for this tab
  on: boolean;
  state: BridgeState;
  port: number;
  // the last command, shown in the status bar so the user can follow along
  lastAction: string | null;
  calls: number;
}

export const bridge = writable<BridgeInfo>({ on: false, state: 'off', port: DEFAULT_PORT, lastAction: null, calls: 0 });
