import type { PaperColor, PaperStyle, PenType } from '$lib/stores/preferences';

export type { PaperColor, PaperStyle, PenType };

export type NotebookKind = 'paper' | 'board';

export interface Paper {
  style: PaperStyle;
  spacing: number;
  color: PaperColor;
}

// page counts from 1, w and h are the pdf page in points, x and y its place on the page
export interface PdfBackground {
  assetId: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PageMeta {
  id: string;
  w: number;
  h: number;
  paper: Paper;
  pdf?: PdfBackground;
}

export interface Notebook {
  id: string;
  name: string;
  kind: NotebookKind;
  createdAt: number;
  updatedAt: number;
  pages: PageMeta[];
  refs: string[];
}

// pts holds x, y, pressure for every point, in page units
export interface Stroke {
  id: string;
  type: 'stroke';
  pen: PenType;
  color: string;
  size: number;
  pts: Float32Array;
}

export type ShapeKind = 'line' | 'arrow' | 'rect' | 'ellipse';

export interface Shape {
  id: string;
  type: 'shape';
  kind: ShapeKind;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  size: number;
}

export interface TextItem {
  id: string;
  type: 'text';
  x: number;
  y: number;
  w: number;
  text: string;
  size: number;
  color: string;
}

export interface ImageSource {
  assetId: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ImageItem {
  id: string;
  type: 'image';
  assetId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  source?: ImageSource;
}

export type Item = Stroke | Shape | TextItem | ImageItem;

// same shape as the boxes rbush wants
export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
