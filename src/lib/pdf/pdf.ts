import type { PDFDocumentProxy, PDFPageProxy, PDFWorker, RenderTask, TextLayer } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { penBusy } from '$lib/engine/input';
import { RenderQueue } from './queue';
import { pageKey, shotId, ShotCache, type Part, type Shot } from './shots';

export type { Part, Shot };

type PdfLib = typeof import('pdfjs-dist');

// the biggest picture one render makes. a page that would be bigger is
// drawn whole at a lower scale and the part on screen sharp on top
export const MAX_PIXELS = 16_000_000;
export const PREVIEW_WIDTH = 480;
const CACHE_PIXELS = 64_000_000;
// renders at once: one draws while pdf.js reads the next in its worker
const RUNNING = 2;
// pages whose parsed drawing commands pdf.js may keep
const PARSED = 12;
const PEN_WAIT = 50;
// ms after the pen lifts before rendering goes on, the next word comes soon
const PEN_PAUSE = 300;

export interface PageSize {
  w: number;
  h: number;
}

export interface PdfFile {
  id: string;
  pages: PageSize[];
}

export interface Wanted {
  file: string;
  // counts from 1 like the pages of the pdf
  page: number;
  scale: number;
  part?: Part;
  priority: number;
}

interface Job extends Wanted {
  id: string;
  key: string;
}

interface Slot {
  task: RenderTask | null;
  cancelled: boolean;
}

type Loader = (id: string) => Promise<Blob | undefined>;

let lib: Promise<{ pdf: PdfLib; worker: PDFWorker }> | null = null;
let loader: Loader | null = null;
const docs = new Map<string, Promise<PDFDocumentProxy>>();
const sizes = new Map<string, Promise<PageSize[]>>();
const files = new Map<string, PdfFile>();
const parsed = new Map<string, number[]>();
const failed = new Set<string>();
const cache = new ShotCache(CACHE_PIXELS, 8, 4);
const queue = new RenderQueue<Job>();
const running = new Map<string, Slot>();
const listeners = new Set<(file: string, page: number) => void>();
let penTimer: ReturnType<typeof setTimeout> | null = null;

// pdf.js is big, it only comes in once the first pdf is opened. all files
// share one worker, starting a worker for each took half a second
function pdfjs(): Promise<{ pdf: PdfLib; worker: PDFWorker }> {
  lib ??= import('pdfjs-dist').then((pdf) => {
    pdf.GlobalWorkerOptions.workerSrc = workerUrl;
    return { pdf, worker: new pdf.PDFWorker() };
  });
  return lib;
}

// loads pdf.js and starts its worker ahead, while someone picks what to do
export function warmPdf() {
  void pdfjs().catch(() => {});
}

function dataUrl(dir: string): string {
  return new URL(`pdfjs/${dir}/`, document.baseURI).href;
}

export function setPdfLoader(fn: Loader) {
  loader = fn;
}

export function onShot(fn: (file: string, page: number) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(file: string, page: number) {
  for (const fn of listeners) fn(file, page);
}

async function parse(data: Blob): Promise<PDFDocumentProxy> {
  const { pdf, worker } = await pdfjs();
  const bytes = new Uint8Array(await data.arrayBuffer());
  return pdf.getDocument({
    data: bytes,
    worker,
    cMapUrl: dataUrl('cmaps'),
    cMapPacked: true,
    standardFontDataUrl: dataUrl('standard_fonts'),
    wasmUrl: dataUrl('wasm'),
    iccUrl: dataUrl('iccs'),
    // pages drawn on the gpu: a big page took 20 ms of the main thread just
    // to get its pixels out of a software canvas
    enableHWA: true
  }).promise;
}

function docOf(id: string): Promise<PDFDocumentProxy> {
  let doc = docs.get(id);
  if (!doc) {
    doc = (async () => {
      const blob = loader ? await loader(id) : undefined;
      if (!blob) throw new Error('the pdf is not in storage');
      return parse(blob);
    })();
    docs.set(id, doc);
    doc.catch(() => {
      failed.add(id);
      notify(id, 0);
    });
  }
  return doc;
}

async function readSizes(doc: PDFDocumentProxy, progress?: (done: number, total: number) => void): Promise<PageSize[]> {
  const total = doc.numPages;
  let done = 0;
  const all = [];
  for (let n = 1; n <= total; n++) {
    all.push(
      doc.getPage(n).then((page) => {
        const v = page.getViewport({ scale: 1 });
        progress?.(++done, total);
        return { w: v.width, h: v.height };
      })
    );
  }
  return Promise.all(all);
}

function sizesOf(id: string, progress?: (done: number, total: number) => void): Promise<PageSize[]> {
  let list = sizes.get(id);
  if (!list) {
    list = docOf(id).then((doc) => readSizes(doc, progress));
    sizes.set(id, list);
    void list.then((pages) => files.set(id, { id, pages })).catch(() => sizes.delete(id));
  }
  return list;
}

// a pdf that is not stored yet, under the id it is going to get. throws
// when pdf.js can not read it, a password is one reason
export async function readPdf(blob: Blob, id: string, progress?: (done: number, total: number) => void): Promise<PdfFile> {
  const doc = parse(blob);
  docs.set(id, doc);
  failed.delete(id);
  try {
    await doc;
  } catch (err) {
    docs.delete(id);
    throw err;
  }
  const pages = await sizesOf(id, progress);
  return { id, pages };
}

export async function openPdf(id: string): Promise<PdfFile> {
  const pages = await sizesOf(id);
  return { id, pages };
}

export function pdfFile(id: string): PdfFile | null {
  return files.get(id) ?? null;
}

export async function pdfPage(id: string, page: number): Promise<PDFPageProxy> {
  return (await docOf(id)).getPage(page);
}

// invisible text over a page so it can be selected and copied, scale is
// css pixels per point. what it returns takes the text away again
export function pdfText(id: string, page: number, container: HTMLElement, scale: number): () => void {
  let layer: TextLayer | null = null;
  let stopped = false;
  void (async () => {
    const [{ pdf }, proxy] = await Promise.all([pdfjs(), pdfPage(id, page)]);
    // laying out the text is real work, it waits for the pen
    while (penBusy(PEN_PAUSE) && !stopped) await new Promise((r) => setTimeout(r, 100));
    if (stopped) return;
    container.style.setProperty('--total-scale-factor', String(scale));
    layer = new pdf.TextLayer({ textContentSource: proxy.streamTextContent(), container, viewport: proxy.getViewport({ scale }) });
    await layer.render();
  })().catch(() => {});
  return () => {
    stopped = true;
    layer?.cancel();
    container.replaceChildren();
  };
}

// the files another notebook does not use are closed with their pictures
export function keepPdfs(keep: Set<string>) {
  for (const id of [...docs.keys()]) {
    if (keep.has(id)) continue;
    for (const [jobId, slot] of running) {
      if (jobId.startsWith(id + ':')) stop(jobId, slot);
    }
    void docs.get(id)?.then((doc) => doc.loadingTask.destroy()).catch(() => {});
    docs.delete(id);
    sizes.delete(id);
    files.delete(id);
    parsed.delete(id);
    cache.clear(id);
  }
  failed.clear();
}

export function capScale(w: number, h: number, scale: number): number {
  const most = Math.sqrt(MAX_PIXELS / Math.max(1, w * h));
  return Math.min(scale, most);
}

export function previewScale(w: number): number {
  return PREVIEW_WIDTH / Math.max(1, w);
}

export function shotsOf(file: string, page: number): Shot[] {
  return cache.of(pageKey(file, page));
}

export function touchShot(shot: Shot) {
  cache.touch(shot);
}

// says what owner needs drawn now, most urgent first. what nobody needs
// any more is dropped, a render already on its way is cancelled
export function want(owner: string, list: Wanted[]) {
  const jobs: Job[] = [];
  for (const w of list) {
    const key = pageKey(w.file, w.page);
    const id = shotId(key, w.scale, w.part);
    if (cache.has(id) || failed.has(w.file)) continue;
    jobs.push({ ...w, id, key });
  }
  for (const id of queue.want(owner, jobs)) {
    const slot = running.get(id);
    if (slot) stop(id, slot);
  }
  pump();
}

function stop(id: string, slot: Slot) {
  slot.cancelled = true;
  slot.task?.cancel();
  running.delete(id);
}

function pump() {
  while (running.size < RUNNING) {
    if (penBusy(PEN_PAUSE)) {
      penTimer ??= setTimeout(() => {
        penTimer = null;
        pump();
      }, PEN_WAIT);
      return;
    }
    const job = queue.next((id) => running.has(id));
    if (!job) return;
    if (cache.has(job.id) || failed.has(job.file)) {
      queue.done(job.id);
      continue;
    }
    const slot: Slot = { task: null, cancelled: false };
    running.set(job.id, slot);
    void run(job, slot);
  }
}

// pdf.js draws a page in slices of up to 15 ms, each in a frame of its
// own. two renders at once put two slices in one frame, so the slices wait
// here and only one goes on per frame, the most urgent render first. none
// while the pen writes
const slices: { go: () => void; priority: number }[] = [];
let releasing = false;

function nextSlice(go: () => void, priority: number) {
  slices.push({ go, priority });
  scheduleSlice();
}

function scheduleSlice() {
  if (releasing) return;
  releasing = true;
  if (penBusy(PEN_PAUSE)) {
    setTimeout(() => {
      releasing = false;
      scheduleSlice();
    }, PEN_WAIT);
  } else {
    requestAnimationFrame(releaseSlice);
  }
}

// go asks pdf.js for the slice in the next frame, the next one waits a frame more
function releaseSlice() {
  releasing = false;
  if (penBusy(PEN_PAUSE)) {
    scheduleSlice();
    return;
  }
  let best = 0;
  for (let i = 1; i < slices.length; i++) if (slices[i].priority < slices[best].priority) best = i;
  const [slice] = slices.splice(best, 1);
  slice?.go();
  if (slices.length > 0) scheduleSlice();
}

async function run(job: Job, slot: Slot) {
  try {
    const doc = await docOf(job.file);
    if (slot.cancelled) return;
    const page = await doc.getPage(job.page);
    if (slot.cancelled) return;
    const shot = await draw(page, job, slot);
    if (!shot) return;
    if (slot.cancelled) {
      shot.picture.close();
      return;
    }
    cache.add(shot);
    remember(doc, job.file, job.page);
    notify(job.file, job.page);
  } catch (err) {
    if (!slot.cancelled && !(err instanceof Error && err.name === 'RenderingCancelledException')) {
      console.warn('a pdf page could not be drawn', err);
    }
  } finally {
    if (running.get(job.id) === slot) running.delete(job.id);
    queue.done(job.id);
    pump();
  }
}

// pdf.js keeps what it parsed of a page, only the last few pages keep it
function remember(doc: PDFDocumentProxy, file: string, page: number) {
  const list = (parsed.get(file) ?? []).filter((n) => n !== page);
  list.push(page);
  while (list.length > PARSED) {
    const old = list.shift()!;
    void doc.getPage(old).then((p) => p.cleanup());
  }
  parsed.set(file, list);
}

async function draw(page: PDFPageProxy, job: Wanted & { id: string; key: string }, slot?: Slot): Promise<Shot | null> {
  const { scale, part } = job;
  const whole = page.getViewport({ scale });
  const x0 = part ? Math.round(part.x * scale) : 0;
  const y0 = part ? Math.round(part.y * scale) : 0;
  const x1 = part ? Math.round((part.x + part.w) * scale) : Math.round(whole.width);
  const y1 = part ? Math.round((part.y + part.h) * scale) : Math.round(whole.height);
  const width = Math.max(1, x1 - x0);
  const height = Math.max(1, y1 - y0);
  if (width * height > MAX_PIXELS * 1.05) throw new Error('a pdf render that big is not allowed');
  const viewport = page.getViewport({ scale, offsetX: -x0, offsetY: -y0 });
  const canvas = new OffscreenCanvas(width, height);
  // pdf.js only touches the 2d context of the canvas, an offscreen one
  // does the same work without being in the page
  const task = page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport, background: '#ffffff' });
  task.onContinue = (go: () => void) => nextSlice(go, job.priority);
  if (slot) slot.task = task;
  await task.promise;
  if (slot?.cancelled) return null;
  // a copy made on the gpu, the main thread does not wait for the pixels
  const picture = await createImageBitmap(canvas);
  canvas.width = canvas.height = 0;
  return {
    id: job.id,
    key: job.key,
    scale,
    full: !part,
    x: x0 / scale,
    y: y0 / scale,
    w: width / scale,
    h: height / scale,
    picture
  };
}

// one picture of a page or a part of it, for a snip or an export. it is not
// kept and not dropped by the queue
export async function renderPart(file: string, page: number, scale: number, part?: Part): Promise<ImageBitmap> {
  const doc = await docOf(file);
  const proxy = await doc.getPage(page);
  const key = pageKey(file, page);
  const shot = await draw(proxy, { file, page, scale, part, priority: 0, id: shotId(key, scale, part), key });
  if (!shot) throw new Error('the render was cancelled');
  return shot.picture;
}

// a whole page picture at about this scale is in the cache once this is
// done, so renderPage and the thumbnails draw it sharp
export async function ensureShot(file: string, page: number, scale: number): Promise<Shot | null> {
  const key = pageKey(file, page);
  const doc = await docOf(file);
  const proxy = await doc.getPage(page);
  const v = proxy.getViewport({ scale: 1 });
  const s = capScale(v.width, v.height, scale);
  const id = shotId(key, s);
  const found = cache.of(key).find((shot) => shot.id === id);
  if (found) return found;
  const shot = await draw(proxy, { file, page, scale: s, priority: 0, id, key });
  if (!shot) return null;
  cache.add(shot);
  notify(file, page);
  return shot;
}
