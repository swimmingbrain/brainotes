export function timeAgo(time: number, now = Date.now()): string {
  const days = Math.floor((now - time) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'a month ago' : `${months} months ago`;
}

export function countPages(count: number, kind: 'paper' | 'board'): string {
  const word = kind === 'board' ? 'board' : 'page';
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}
