export function timeAgo(time: number, now = Date.now()): string {
  const minutes = Math.floor((now - time) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'a month ago' : `${months} months ago`;
}

export function countPages(count: number, kind: 'paper' | 'board'): string {
  const word = kind === 'board' ? 'board' : 'page';
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}
