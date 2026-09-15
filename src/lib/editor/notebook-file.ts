import { pickFiles } from './images';
import { addNotebook, uniqueName } from './library';
import { addToast, dismissToast } from '$lib/stores/app';

export function isNotebookFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.brainotes');
}

function pause(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// every file becomes a new notebook next to the others, then it opens
export async function importNotebookFiles(files: File[]) {
  for (const file of files) {
    const toast = addToast(`Opening ${file.name}...`, 'info', 0);
    try {
      const { readNotebookFile, withFreshIds } = await import('$lib/storage/file');
      const fresh = withFreshIds(await readNotebookFile(file, pause));
      fresh.notebook.name = uniqueName(fresh.notebook.name);
      await addNotebook(fresh.notebook, fresh.pages, fresh.assets);
    } catch (err) {
      console.warn(err);
      // a file from a newer version says so, see FileFormatError
      const newer = (err as { newer?: boolean } | null)?.newer === true;
      addToast(newer ? `${file.name} needs a newer braiNOTES` : `${file.name} is not a notebook braiNOTES can read`, 'warning', 5000);
    } finally {
      dismissToast(toast);
    }
  }
}

export function openNotebookFile() {
  void pickFiles('.brainotes').then((files) => importNotebookFiles(files.filter(isNotebookFile)));
}
