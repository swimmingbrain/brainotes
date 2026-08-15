// ink that reads on white and cream paper, plus white for the dark one
export const INK_COLORS = ['#1f1f22', '#6b6f78', '#1f5fd1', '#d63a3a', '#2f9e44', '#7048e8', '#e8590c', '#ffffff'];

// light and see through, they sit behind the ink
export const HIGHLIGHTER_COLORS = ['#ffd43b', '#8ce99a', '#74c0fc', '#faa2c1', '#ffc078'];

export function sameColor(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
