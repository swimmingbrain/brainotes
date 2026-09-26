import { newId } from '../doc';
import { inkColor, isDark } from '../render';
import { LINE_HEIGHT, layoutText, measurer, TEXT_FONT, textWidth } from '../text';
import type { TextItem } from '../types';
import type { CanvasView } from '../view';
import type { Sample, Tool } from './tool';

export interface TextSettings {
  size: number;
  color: string;
}

// page units kept free at the right edge of a paper page
const EDGE = 8;
const MIN_WIDTH = 40;

interface Editing {
  pageId: string;
  x: number;
  y: number;
  size: number;
  color: string;
  // the text that is being changed, null for a new one
  old: TextItem | null;
  // where the lines wrap, the right edge of the page
  max: number;
}

// a textarea over the canvas, with the size and line breaks of the drawn text
export class TextTool implements Tool {
  private area: HTMLTextAreaElement | null = null;
  private editing: Editing | null = null;

  constructor(
    private view: CanvasView,
    private settings: () => TextSettings,
    private find: (index: number, x: number, y: number) => TextItem | null
  ) {}

  get active(): boolean {
    return this.editing !== null;
  }

  private toPage(index: number, s: Sample): [number, number] {
    const cam = this.view.cam;
    return [cam.x + s.x / cam.zoom - this.view.pageX(index), cam.y + s.y / cam.zoom - this.view.pageY(index)];
  }

  down(s: Sample) {
    this.commit();
    const index = this.view.pageAtScreen(s.x, s.y);
    if (index < 0) return;
    const [x, y] = this.toPage(index, s);
    const hit = this.find(index, x, y);
    if (hit) {
      this.edit(index, hit);
      return;
    }
    const set = this.settings();
    // the line the caret is on sits centred on the click
    this.open(index, { x, y: y - (set.size * LINE_HEIGHT) / 2, size: set.size, color: set.color, old: null });
  }

  move() {}

  // focus after the press is over, so nothing takes it back
  up() {
    this.area?.focus();
  }

  cancel() {}

  edit(index: number, item: TextItem) {
    this.commit();
    this.open(index, { x: item.x, y: item.y, size: item.size, color: item.color, old: item });
    this.view.hide(index, [item]);
    if (this.area) {
      this.area.value = item.text;
      this.place();
      this.area.focus();
      this.area.setSelectionRange(item.text.length, item.text.length);
    }
  }

  private open(index: number, e: Omit<Editing, 'pageId' | 'max'>) {
    const meta = this.view.doc.notebook.pages[index];
    const max = this.view.isBoard ? Infinity : Math.max(MIN_WIDTH, meta.w - e.x - EDGE);
    this.editing = { ...e, pageId: meta.id, max };
    const area = this.area ?? this.makeArea();
    area.value = '';
    area.style.color = inkColor(e.color, isDark(meta.paper));
    area.style.whiteSpace = max === Infinity ? 'pre' : 'pre-wrap';
    area.style.display = 'block';
    this.place();
    area.focus();
  }

  private makeArea(): HTMLTextAreaElement {
    const area = document.createElement('textarea');
    area.className = 'text-editor';
    area.spellcheck = false;
    area.setAttribute('aria-label', 'Text');
    area.style.cssText = [
      'position:absolute',
      'display:none',
      'margin:0',
      'padding:0',
      'border:0',
      'outline:none',
      'resize:none',
      'overflow:hidden',
      'background:transparent',
      'overflow-wrap:break-word',
      'font-kerning:normal',
      'z-index:2',
      `font-family:${TEXT_FONT}`,
      'font-weight:400'
    ].join(';');
    area.addEventListener('input', () => this.place());
    area.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.commit();
      }
    });
    // clicking anywhere else ends the text, leaving the window does not
    area.addEventListener('blur', () => {
      if (document.hasFocus()) this.commit();
    });
    this.view.host.appendChild(area);
    this.area = area;
    return area;
  }

  // puts the textarea over the text, call it after the camera moved
  place() {
    const e = this.editing;
    const area = this.area;
    if (!e || !area) return;
    const index = this.view.doc.indexOf(e.pageId);
    if (index < 0) {
      this.close();
      return;
    }
    if (this.view.isBoard && index !== this.view.board) {
      this.commit();
      return;
    }
    const cam = this.view.cam;
    const z = cam.zoom;
    const measure = measurer(e.size);
    const lines = layoutText(area.value, e.max, measure);
    const width = textWidth(lines, e.max, measure);
    area.style.left = `${(this.view.pageX(index) + e.x - cam.x) * z}px`;
    area.style.top = `${(this.view.pageY(index) + e.y - cam.y) * z}px`;
    area.style.fontSize = `${e.size * z}px`;
    area.style.lineHeight = `${e.size * LINE_HEIGHT * z}px`;
    // room for the caret after the last letter
    const wide = e.max === Infinity ? width * z + 2 : Math.min(width * z + 2, e.max * z);
    area.style.width = `${Math.max(wide, 4)}px`;
    area.style.height = `${lines.length * e.size * LINE_HEIGHT * z}px`;
  }

  // the text goes into the page, an empty one is dropped. one undo step
  commit() {
    const e = this.editing;
    const area = this.area;
    if (!e || !area) return;
    const text = area.value.replace(/\s+$/, '');
    this.close();
    const page = this.view.doc.page(e.pageId);
    const old = e.old;
    if (!page || (old && old.text === text)) {
      this.view.unhide(true);
      return;
    }
    this.view.unhide(false);
    const at = old ? page.items.indexOf(old) : -1;
    const removed = old && at >= 0 ? [{ item: old, index: at }] : [];
    const added = [];
    if (text.trim() !== '') {
      const measure = measurer(e.size);
      const w = textWidth(layoutText(text, e.max, measure), e.max, measure);
      const item: TextItem = { id: old?.id ?? newId(), type: 'text', x: e.x, y: e.y, w, text, size: e.size, color: e.color };
      added.push({ item, index: at >= 0 ? at : page.items.length });
    }
    if (removed.length === 0 && added.length === 0) {
      this.view.unhide(true);
      return;
    }
    this.view.history.run({ type: 'items', pageId: e.pageId, removed, added });
  }

  private close() {
    this.editing = null;
    if (this.area) {
      this.area.style.display = 'none';
      this.area.value = '';
      if (document.activeElement === this.area) this.area.blur();
    }
  }

  destroy() {
    this.close();
    this.area?.remove();
    this.area = null;
  }
}
