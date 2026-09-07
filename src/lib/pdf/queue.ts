export interface Job {
  id: string;
  // lower goes first
  priority: number;
}

// the renders the canvas, the reference panel and the thumbnails want.
// each of them says again and again what it needs right now, a job nobody
// asks for any more is dropped
export class RenderQueue<T extends Job> {
  private owners = new Map<string, Map<string, T>>();

  // replaces what owner wanted before. returns the ids no one wants now
  want(owner: string, jobs: T[]): string[] {
    const before = this.owners.get(owner);
    const next = new Map<string, T>();
    for (const job of jobs) {
      const seen = next.get(job.id);
      if (!seen || job.priority < seen.priority) next.set(job.id, job);
    }
    if (next.size > 0) this.owners.set(owner, next);
    else this.owners.delete(owner);
    const dropped: string[] = [];
    if (before) {
      for (const id of before.keys()) if (!next.has(id) && !this.has(id)) dropped.push(id);
    }
    return dropped;
  }

  has(id: string): boolean {
    for (const jobs of this.owners.values()) if (jobs.has(id)) return true;
    return false;
  }

  // the most urgent job that is not running yet, the first asked for wins a tie
  next(skip: (id: string) => boolean): T | null {
    let best: T | null = null;
    for (const jobs of this.owners.values()) {
      for (const job of jobs.values()) {
        if (skip(job.id)) continue;
        if (!best || job.priority < best.priority) best = job;
      }
    }
    return best;
  }

  // finished or failed, no one has to wait for it any more
  done(id: string) {
    for (const [owner, jobs] of this.owners) {
      jobs.delete(id);
      if (jobs.size === 0) this.owners.delete(owner);
    }
  }

  get size(): number {
    const ids = new Set<string>();
    for (const jobs of this.owners.values()) for (const id of jobs.keys()) ids.add(id);
    return ids.size;
  }
}
