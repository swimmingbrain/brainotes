import { describe, expect, it } from 'vitest';
import { RenderQueue } from './queue';

describe('the render queue', () => {
  it('hands out the most urgent job first', () => {
    const queue = new RenderQueue();
    queue.want('canvas', [
      { id: 'a', priority: 5 },
      { id: 'b', priority: 1 },
      { id: 'c', priority: 3 }
    ]);
    expect(queue.next(() => false)?.id).toBe('b');
    expect(queue.next((id) => id === 'b')?.id).toBe('c');
    queue.done('b');
    expect(queue.next(() => false)?.id).toBe('c');
    expect(queue.size).toBe(2);
  });

  it('takes the most urgent ask when two want the same', () => {
    const queue = new RenderQueue();
    queue.want('canvas', [
      { id: 'a', priority: 1 },
      { id: 'b', priority: 9 }
    ]);
    queue.want('panel', [{ id: 'b', priority: 0 }]);
    expect(queue.next(() => false)?.id).toBe('b');
    expect(queue.size).toBe(2);
  });

  it('drops what nobody asks for any more', () => {
    const queue = new RenderQueue();
    queue.want('canvas', [
      { id: 'a', priority: 1 },
      { id: 'b', priority: 2 }
    ]);
    queue.want('panel', [{ id: 'b', priority: 1 }]);
    // b is still wanted by the panel, only a goes
    expect(queue.want('canvas', [{ id: 'c', priority: 1 }])).toEqual(['a']);
    expect(queue.want('panel', [])).toEqual(['b']);
    expect(queue.has('b')).toBe(false);
    expect(queue.next(() => false)?.id).toBe('c');
  });
});
