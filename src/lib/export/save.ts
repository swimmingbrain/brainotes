import { fileSave } from 'browser-fs-access';

export type FileKind = 'pdf' | 'png' | 'brainotes';

const KINDS: Record<FileKind, { ext: string; description: string; mime: string }> = {
  pdf: { ext: '.pdf', description: 'PDF', mime: 'application/pdf' },
  png: { ext: '.png', description: 'PNG picture', mime: 'image/png' },
  brainotes: { ext: '.brainotes', description: 'braiNOTES notebook', mime: 'application/zip' }
};

export function fileName(name: string, kind: FileKind): string {
  const clean = name.replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return `${(clean || 'notebook').slice(0, 120)}${KINDS[kind].ext}`;
}

// the dialog opens while the click still counts, false when it was closed
export async function saveFile(blob: Promise<Blob>, name: string, kind: FileKind): Promise<boolean> {
  const { ext, description, mime } = KINDS[kind];
  try {
    await fileSave(blob, { fileName: name, extensions: [ext], description, mimeTypes: [mime], id: 'brainotes-export' });
    return true;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return false;
    throw err;
  }
}
