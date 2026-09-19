// a tab holds a web lock on the notebook it has open, so a second tab can
// not open the same one and the two never write over each other. the lock
// goes away by itself when the tab closes
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

export async function openElsewhere(id: string): Promise<boolean> {
  if (held.has(id)) return false;
  if (!(await lockNotebook(id))) return true;
  unlockNotebook(id);
  return false;
}
