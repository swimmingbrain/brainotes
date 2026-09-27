export interface Job {
  id: string;
  priority: number;
}

// each owner says again and again what it needs now, the rest is dropped
export class RenderQueue<T extends Job> {
  private owners = new Map<string, Map<string, T>>();

  // returns the ids no one wants any more
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
