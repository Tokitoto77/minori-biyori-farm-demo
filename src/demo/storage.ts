import type { DemoState } from '../domain/types';
import { createInitialState, DEMO_STATE_VERSION } from './seed';

const STORAGE_KEY = `minori-biyori-demo-v${DEMO_STATE_VERSION}`;
export const DEMO_UPDATED_EVENT = 'minori-biyori-demo-updated';

export function readDemoState(): DemoState {
  if (typeof window === 'undefined') return createInitialState();
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    const initial = createInitialState();
    writeDemoState(initial);
    return initial;
  }

  try {
    const parsed = JSON.parse(stored) as DemoState;
    if (parsed.version !== DEMO_STATE_VERSION) throw new Error('version mismatch');
    return parsed;
  } catch {
    const initial = createInitialState();
    writeDemoState(initial);
    return initial;
  }
}

export function writeDemoState(state: DemoState): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(DEMO_UPDATED_EVENT));
}

export function resetDemoState(): void {
  writeDemoState(createInitialState());
}
