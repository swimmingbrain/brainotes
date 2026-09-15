import {
  decodePDFRawStream,
  PDFArray,
  PDFContentStream,
  PDFDocument,
  PDFName,
  PDFObjectCopier,
  PDFRawStream,
  PDFStream,
  type PDFObject,
  type PDFPage,
  type PDFRef
} from '@pdfme/pdf-lib';
import { drawItem, HIGHLIGHTER_ALPHA, inkColor, isDark, isMarker, PDF_EDGE, type Frame } from '$lib/engine/render';
import { PENS } from '$lib/engine/stroke';
import { LINE_HEIGHT, textLayout } from '$lib/engine/text';
import type { ImageItem, Item, Notebook, PageMeta, PdfBackground, TextItem } from '$lib/engine/types';
import { PAPER_COLORS } from '$lib/editor/paper';
import { capScale, pdfDark, renderPart } from '$lib/pdf/pdf';
import { isJpeg, jpegOrientation } from './jpeg';
import {
  blendOver,
  boardFrame,
  dotsOf,
  fillColor,
  imageMatrix,
  matrix,
  num,
  pageSetup,
  patternOps,
  pdfMatrix,
  shapeOps,
  strokePathOps
} from './ops';

export interface ExportPage {
  meta: PageMeta;
  items: Item[];
}

// where the pages and the stored files come from
export interface ExportInput {
  page: (index: number) => Promise<ExportPage>;
  asset: (id: string) => Promise<Blob | undefined>;
}

export interface ExportHooks {
  progress?: (done: number, total: number) => void;
  // true stops the export, it then throws an AbortError
  stopped?: () => boolean;
}

type Dict = { [key: string]: Dict | string | number | boolean | number[] | PDFObject };

interface Form {
  ref: PDFRef;
  crop: { x: number; y: number; w: number; h: number };
  rotate: number;
}

interface Source {
  doc: PDFDocument;
  copier: PDFObjectCopier;
}

// device pixels per point of a text and of a pdf page that has to be drawn
// as a picture because its file could not be read
const TEXT_SCALE = 4;
const TEXT_PIXELS = 8_000_000;
const RASTER_SCALE = 200 / 72;
// ms of work before a page lets the browser draw a frame
const SLICE = 12;

const encoder = new TextEncoder();

function pause(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function rect(x: number, y: number, w: number, h: number): string {
  return `${num(x)} ${num(y)} ${num(w)} ${num(h)} re`;
}

// the part of a pdf page a viewer shows: its crop box inside its media box
function viewBox(page: PDFPage): { x: number; y: number; w: number; h: number } {
  const norm = (b: { x: number; y: number; width: number; height: number }) => ({
    x0: Math.min(b.x, b.x + b.width),
    y0: Math.min(b.y, b.y + b.height),
    x1: Math.max(b.x, b.x + b.width),
    y1: Math.max(b.y, b.y + b.height)
  });
  const media = norm(page.getMediaBox());
  const crop = norm(page.getCropBox());
  const x0 = Math.max(media.x0, crop.x0);
  const y0 = Math.max(media.y0, crop.y0);
  const x1 = Math.min(media.x1, crop.x1);
  const y1 = Math.min(media.y1, crop.y1);
  if (x1 <= x0 || y1 <= y0) return { x: media.x0, y: media.y0, w: media.x1 - media.x0, h: media.y1 - media.y0 };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// the pictures and graphics states one page uses, under short names
class PageResources {
  xobjects: Dict = {};
  states: Dict = {};
  patterns: Dict = {};
  private names = new Map<PDFRef, string>();
  private stateNames = new Map<string, string>();

  xobject(ref: PDFRef): string {
    let name = this.names.get(ref);
    if (!name) {
      name = `X${this.names.size + 1}`;
      this.names.set(ref, name);
      this.xobjects[name] = ref;
    }
    return name;
  }

  pattern(ref: PDFRef): string {
    const name = `P${Object.keys(this.patterns).length + 1}`;
    this.patterns[name] = ref;
    return name;
  }

  state(dict: Dict): string {
    const key = JSON.stringify(dict);
    let name = this.stateNames.get(key);
    if (!name) {
      name = `G${this.stateNames.size + 1}`;
      this.stateNames.set(key, name);
      this.states[name] = { Type: 'ExtGState', ...dict };
    }
    return name;
  }
}

class PdfWriter {
  private sources = new Map<string, Promise<Source | null>>();
  private forms = new Map<string, Promise<Form | null>>();
  private pictures = new Map<string, Promise<PDFRef | null>>();
  private tiles = new Map<string, Promise<PDFRef>>();
  private started = 0;

  constructor(
    private out: PDFDocument,
    private input: ExportInput,
    private hooks: ExportHooks
  ) {}

  // a long page lets a frame through now and then
  async breathe() {
    if (this.hooks.stopped?.()) throw new DOMException('the export was stopped', 'AbortError');
    if (performance.now() - this.started < SLICE) return;
    await pause();
    this.started = performance.now();
  }

  private async stream(bytes: Uint8Array, dict: Dict): Promise<PDFRef> {
    const context = this.out.context;
    if (typeof CompressionStream === 'undefined') return context.register(context.flateStream(bytes, dict));
    return context.register(context.stream(await deflate(bytes), { ...dict, Filter: 'FlateDecode' }));
  }

  async addPage(page: ExportPage, board: boolean) {
    this.started = performance.now();
    const { meta, items } = page;
    const frame: Frame = board ? boardFrame(meta, items) : { x: 0, y: 0, w: meta.w, h: meta.h };
    const setup = pageSetup(frame);
    const res = new PageResources();
    const dark = isDark(meta.paper);
    const parts: string[] = [`q ${matrix(setup.m)}`];

    parts.push(`${fillColor(PAPER_COLORS[meta.paper.color].paper)} ${rect(frame.x, frame.y, frame.w, frame.h)} f`);
    parts.push(patternOps(meta.paper, frame, board));
    const dots = dotsOf(meta.paper, frame, board, setup.m);
    if (dots) parts.push(`/Pattern cs /${res.pattern(await this.tileOf(dots))} scn ${dots.area} f`);
    if (meta.pdf) parts.push(await this.background(meta.pdf, meta, res));

    // the layers of the canvas: pictures, the highlighter, then the ink
    for (const item of items) {
      if (item.type !== 'image') continue;
      parts.push(await this.image(item, res));
      await this.breathe();
    }
    const marks = items.filter(isMarker);
    if (marks.length > 0) parts.push(await this.highlighter(marks, meta, frame, res));
    for (const item of items) {
      if (item.type === 'image' || isMarker(item)) continue;
      if (item.type === 'stroke') {
        const path = strokePathOps(item);
        if (!path) continue;
        const color = fillColor(inkColor(item.color, dark));
        const alpha = PENS[item.pen].alpha;
        if (alpha < 1) parts.push(`q /${res.state({ ca: alpha })} gs ${color}\n${path}\nf Q`);
        else parts.push(`${color}\n${path}\nf`);
      } else if (item.type === 'shape') {
        parts.push(shapeOps(item, inkColor(item.color, dark)));
      } else if (item.type === 'text') {
        parts.push(await this.text(item, dark, res));
      }
      await this.breathe();
    }
    parts.push('Q');

    const contents = await this.stream(encoder.encode(parts.join('\n')), {});
    const pdfPage = this.out.addPage([setup.w, setup.h]);
    const context = this.out.context;
    pdfPage.node.set(PDFName.of('Contents'), contents);
    pdfPage.node.set(
      PDFName.of('Resources'),
      context.obj({ XObject: res.xobjects, ExtGState: res.states, Pattern: res.patterns })
    );
  }

  // the dot tile, once for all pages that have the same dots in the same place
  private tileOf(dots: { tile: string; step: number; matrix: number[] }): Promise<PDFRef> {
    const key = `${dots.step}:${dots.matrix.join(',')}:${dots.tile}`;
    let found = this.tiles.get(key);
    if (!found) {
      found = this.stream(encoder.encode(dots.tile), {
        Type: 'Pattern',
        PatternType: 1,
        PaintType: 1,
        TilingType: 1,
        BBox: [0, 0, dots.step, dots.step],
        XStep: dots.step,
        YStep: dots.step,
        Matrix: dots.matrix,
        Resources: {}
      });
      this.tiles.set(key, found);
    }
    return found;
  }

  // the pdf page on white, like the picture pdf.js draws of it, and a thin
  // edge when it shares its page with room for notes
  private async background(bg: PdfBackground, meta: PageMeta, res: PageResources): Promise<string> {
    const box = rect(bg.x, bg.y, bg.w, bg.h);
    const parts = [`1 g ${box} f`];
    const form = await this.formOf(bg.assetId, bg.page);
    if (form) {
      parts.push(`q ${box} W n ${matrix(pdfMatrix(form.crop, form.rotate, bg))} /${res.xobject(form.ref)} Do Q`);
    } else {
      const picture = await this.rasterOf(bg);
      if (picture) parts.push(`q ${matrix(imageMatrix(bg.x, bg.y, bg.w, bg.h))} /${res.xobject(picture)} Do Q`);
    }
    if (bg.w < meta.w - 1 || bg.h < meta.h - 1) {
      const [r, g, b] = blendOver(PDF_EDGE, '#ffffff').map((v) => num(v / 255));
      parts.push(`${r} ${g} ${b} RG 0.5 w ${box} S`);
    }
    return parts.join('\n');
  }

  private sourceOf(assetId: string): Promise<Source | null> {
    let found = this.sources.get(assetId);
    if (!found) {
      found = (async () => {
        const blob = await this.input.asset(assetId);
        if (!blob) return null;
        try {
          // an empty password opens the pdfs that are only locked against editing
          const doc = await PDFDocument.load(await blob.arrayBuffer(), { password: '', updateMetadata: false });
          return { doc, copier: PDFObjectCopier.for(doc.context, this.out.context) };
        } catch (err) {
          console.warn('a pdf could not be read for the export, its pages go in as pictures', err);
          return null;
        }
      })();
      this.sources.set(assetId, found);
    }
    return found;
  }

  private formOf(assetId: string, page: number): Promise<Form | null> {
    const key = `${assetId}:${page}`;
    let found = this.forms.get(key);
    if (!found) {
      found = (async () => {
        const source = await this.sourceOf(assetId);
        if (!source || page < 1 || page > source.doc.getPageCount()) return null;
        try {
          return await this.copyPage(source, page - 1);
        } catch (err) {
          console.warn('a pdf page could not be copied, it goes in as a picture', err);
          return null;
        }
      })();
      this.forms.set(key, found);
    }
    return found;
  }

  // the original page as a form, so its text and drawings stay vectors. the
  // copier is shared by all pages of a file, its fonts go in only once
  private async copyPage(source: Source, index: number): Promise<Form> {
    const page = source.doc.getPage(index);
    const node = page.node;
    const crop = viewBox(page);
    const rotate = page.getRotation().angle;
    const found = source.doc.context.lookup(node.get(PDFName.of('Contents')));
    const streams: PDFStream[] = [];
    if (found instanceof PDFArray) {
      for (let i = 0; i < found.size(); i++) streams.push(found.lookup(i, PDFStream));
    } else if (found instanceof PDFStream) {
      streams.push(found);
    }

    const context = this.out.context;
    let form: PDFStream;
    let ref: PDFRef;
    if (streams.length === 1 && streams[0] instanceof PDFRawStream) {
      // a single stream is taken over as it is, nothing is decoded
      form = source.copier.copy(streams[0]) as PDFRawStream;
      ref = context.register(form);
    } else {
      const chunks = streams.map((s) =>
        s instanceof PDFRawStream ? decodePDFRawStream(s).decode() : (s as PDFContentStream).getUnencodedContents()
      );
      const size = chunks.reduce((sum, c) => sum + c.length + 1, 0);
      const joined = new Uint8Array(size);
      let at = 0;
      for (const chunk of chunks) {
        joined.set(chunk, at);
        joined[at + chunk.length] = 10;
        at += chunk.length + 1;
      }
      ref = await this.stream(joined, {});
      form = context.lookup(ref, PDFStream);
    }

    const set = (key: string, value: PDFObject) => form.dict.set(PDFName.of(key), value);
    set('Type', PDFName.of('XObject'));
    set('Subtype', PDFName.of('Form'));
    set('FormType', context.obj(1));
    set('BBox', context.obj([crop.x, crop.y, crop.x + crop.w, crop.y + crop.h]));
    const resources = node.getInheritableAttribute(PDFName.of('Resources'));
    set('Resources', resources ? source.copier.copy(resources) : context.obj({}));
    const group = node.get(PDFName.of('Group'));
    if (group) set('Group', source.copier.copy(group));
    return { ref, crop, rotate };
  }

  // a pdf page pdf-lib can not read is drawn by pdf.js as a picture
  private rasterOf(bg: PdfBackground): Promise<PDFRef | null> {
    const key = `pdf:${bg.assetId}:${bg.page}`;
    let found = this.pictures.get(key);
    if (!found) {
      found = (async () => {
        try {
          const picture = await renderPart(bg.assetId, bg.page, capScale(bg.w, bg.h, RASTER_SCALE));
          const canvas = new OffscreenCanvas(picture.width, picture.height);
          canvas.getContext('2d')!.drawImage(picture, 0, 0);
          picture.close();
          const jpeg = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
          return (await this.out.embedJpg(new Uint8Array(await jpeg.arrayBuffer()))).ref;
        } catch (err) {
          console.warn('a pdf page could not be drawn for the export', err);
          return null;
        }
      })();
      this.pictures.set(key, found);
    }
    return found;
  }

  private async image(item: ImageItem, res: PageResources): Promise<string> {
    const ref = await this.pictureOf(item.assetId);
    if (!ref) return '';
    return `q ${matrix(imageMatrix(item.x, item.y, item.w, item.h))} /${res.xobject(ref)} Do Q`;
  }

  // a stored picture, once for every place it is used. a jpeg goes in as it is
  private pictureOf(assetId: string): Promise<PDFRef | null> {
    let found = this.pictures.get(assetId);
    if (!found) {
      found = (async () => {
        const blob = await this.input.asset(assetId);
        if (!blob) return null;
        try {
          const bytes = new Uint8Array(await blob.arrayBuffer());
          if (isJpeg(bytes) && jpegOrientation(bytes) === 1) {
            try {
              return (await this.out.embedJpg(bytes)).ref;
            } catch {}
          }
          const bitmap = await createImageBitmap(blob);
          try {
            return await this.pixels(bitmap, bitmap.width, bitmap.height);
          } finally {
            bitmap.close();
          }
        } catch (err) {
          console.warn('a picture could not be put into the pdf', err);
          return null;
        }
      })();
      this.pictures.set(assetId, found);
    }
    return found;
  }

  private async pixels(source: CanvasImageSource, w: number, h: number): Promise<PDFRef> {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(source, 0, 0, w, h);
    return this.imageData(ctx.getImageData(0, 0, w, h));
  }

  // rgb pixels and, when some are see through, their alpha as a soft mask
  private async imageData(data: ImageData): Promise<PDFRef> {
    const { width: w, height: h } = data;
    const px = data.data;
    const color = new Uint8Array(w * h * 3);
    const alpha = new Uint8Array(w * h);
    let clear = false;
    for (let i = 0, j = 0, k = 0; i < px.length; i += 4, j += 3, k++) {
      color[j] = px[i];
      color[j + 1] = px[i + 1];
      color[j + 2] = px[i + 2];
      alpha[k] = px[i + 3];
      if (px[i + 3] !== 255) clear = true;
    }
    const dict: Dict = { Type: 'XObject', Subtype: 'Image', Width: w, Height: h, ColorSpace: 'DeviceRGB', BitsPerComponent: 8 };
    if (clear) {
      dict.SMask = await this.stream(alpha, {
        Type: 'XObject',
        Subtype: 'Image',
        Width: w,
        Height: h,
        ColorSpace: 'DeviceGray',
        BitsPerComponent: 8
      });
    }
    return this.stream(color, dict);
  }

  // all highlighter strokes in one group, laid on at once with the opacity
  // and the blend of the canvas, so where they overlap it gets no darker
  private async highlighter(marks: Item[], meta: PageMeta, frame: Frame, res: PageResources): Promise<string> {
    const dark = isDark(meta.paper);
    const parts: string[] = [];
    for (const mark of marks) {
      if (mark.type !== 'stroke') continue;
      const path = strokePathOps(mark);
      if (path) parts.push(`${fillColor(inkColor(mark.color, dark))}\n${path}\nf`);
      await this.breathe();
    }
    const group = await this.stream(encoder.encode(parts.join('\n')), {
      Type: 'XObject',
      Subtype: 'Form',
      FormType: 1,
      BBox: [frame.x, frame.y, frame.x + frame.w, frame.y + frame.h],
      Group: { Type: 'Group', S: 'Transparency', I: true },
      Resources: {}
    });
    const normal = dark || (meta.pdf !== undefined && (await pdfDark(meta.pdf.assetId, meta.pdf.page, meta.pdf.w)));
    const state = res.state({ ca: HIGHLIGHTER_ALPHA, CA: HIGHLIGHTER_ALPHA, BM: normal ? 'Normal' : 'Multiply' });
    return `q /${state} gs /${res.xobject(group)} Do Q`;
  }

  // a text becomes a picture, so every letter shows whatever the font has
  private async text(item: TextItem, dark: boolean, res: PageResources): Promise<string> {
    if (item.text.trim() === '') return '';
    const layout = textLayout(item);
    const pad = item.size * 0.5;
    const w = Math.max(item.w, layout.width) + pad * 2;
    const h = layout.lines.length * item.size * LINE_HEIGHT + pad * 2;
    let s = TEXT_SCALE;
    if (w * h * s * s > TEXT_PIXELS) s = Math.sqrt(TEXT_PIXELS / (w * h));
    const cw = Math.max(1, Math.ceil(w * s));
    const ch = Math.max(1, Math.ceil(h * s));
    const canvas = new OffscreenCanvas(cw, ch);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.setTransform(s, 0, 0, s, (pad - item.x) * s, (pad - item.y) * s);
    drawItem(ctx, item, dark, s);
    const ref = await this.imageData(ctx.getImageData(0, 0, cw, ch));
    return `q ${matrix(imageMatrix(item.x - pad, item.y - pad, cw / s, ch / s))} /${res.xobject(ref)} Do Q`;
  }

  async save(): Promise<Uint8Array> {
    return this.out.save({ objectsPerTick: 50 });
  }
}

// the pages of a notebook as one pdf, a page at a time so the app keeps
// running. a board page becomes a page as big as its ink
export async function exportPdf(notebook: Notebook, indices: number[], input: ExportInput, hooks: ExportHooks = {}): Promise<Blob> {
  const out = await PDFDocument.create();
  out.setTitle(notebook.name);
  out.setCreator('braiNOTES');
  out.setProducer('braiNOTES');
  const writer = new PdfWriter(out, input, hooks);
  const board = notebook.kind === 'board';
  for (let n = 0; n < indices.length; n++) {
    await writer.addPage(await input.page(indices[n]), board);
    hooks.progress?.(n + 1, indices.length);
    await pause();
  }
  const bytes = await writer.save();
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
}
