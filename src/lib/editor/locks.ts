// a web lock per open notebook, so two tabs never write over each other.
// it goes away by itself when the tab closes
const held = new Map<string, () => void>();

function lockName(id: string): string {
  return `brainotes-notebook-${id}`;
}

export function lockNotebook(id: string): Promise<boolean> {
  if (held.has(id) || typeof navigator === 'undefined' || !navigator.locks) return Promise.resolve(true);
  return new Promise((resolve) => {
    navigator.locks
      .request(lockName(id), { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve(false);
          return;
        }
        resolve(true);
        // the lock is held until this promise settles
        return new Promise<void>((release) => held.set(id, release));
      })
      .catch(() => resolve(true));
  });
}

export function unlockNotebook(id: string) {
  held.get(id)?.();
  held.delete(id);
}
