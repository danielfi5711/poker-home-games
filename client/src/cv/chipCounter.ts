import type { ChipColor, ChipColorId } from '../../../src/shared/types.js';

/**
 * Best-effort, fully on-device chip-stack counter. No ML model, no server
 * round-trip, no dependency — just canvas pixel math. It is a *guess*: the
 * app always shows these numbers on an editable confirmation screen before
 * they're used for money, so this only needs to get most stacks close, not
 * perfect.
 *
 * Expects a photo of chips arranged in stacks sorted by color (the normal
 * way poker players organize a stack for counting) — the algorithm:
 *  1. Classifies every pixel to the nearest color in the session's chip
 *     palette (or "background").
 *  2. Finds connected blobs per color — each blob is a candidate stack.
 *  3. Estimates chips-per-blob two ways and reconciles them:
 *     - geometry: stack height ÷ an assumed chip-thickness-to-diameter
 *       ratio, using the blob's own width as the diameter reference (so it
 *       self-calibrates to how close the photo was taken).
 *     - edges: counts the horizontal rim lines up the middle of the stack
 *       via a brightness-gradient peak count.
 */

const MAX_DIMENSION = 480;
/** Real casino chips are ~39mm diameter × ~3.3mm thick. */
const CHIP_THICKNESS_TO_DIAMETER = 3.3 / 39;
const COLOR_MATCH_THRESHOLD = 60; // Euclidean RGB distance
const MIN_BLOB_AREA_FRACTION = 0.0015; // of the analyzed image area

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): Rgb {
  const clean = hex.replace('#', '');
  const n = parseInt(clean, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function dist2(a: Rgb, b: Rgb): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

interface Blob {
  colorIndex: number;
  area: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function drawDownscaled(image: CanvasImageSource, srcW: number, srcH: number): { ctx: CanvasRenderingContext2D; width: number; height: number } {
  const scale = Math.min(1, MAX_DIMENSION / Math.max(srcW, srcH));
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D not supported on this device.');
  ctx.drawImage(image, 0, 0, width, height);
  return { ctx, width, height };
}

/** Labels every pixel with a palette color index, or -1 for "background". */
function classifyPixels(pixels: Uint8ClampedArray, width: number, height: number, palette: Rgb[]): Int16Array {
  const labels = new Int16Array(width * height);
  const threshold2 = COLOR_MATCH_THRESHOLD * COLOR_MATCH_THRESHOLD;
  for (let i = 0, p = 0; i < labels.length; i++, p += 4) {
    const px: Rgb = { r: pixels[p], g: pixels[p + 1], b: pixels[p + 2] };
    let best = -1;
    let bestDist = threshold2;
    for (let c = 0; c < palette.length; c++) {
      const d = dist2(px, palette[c]!);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    labels[i] = best;
  }
  return labels;
}

/** 4-connected flood fill to find one blob per contiguous color region. */
function findBlobs(labels: Int16Array, width: number, height: number, minArea: number): Blob[] {
  const visited = new Uint8Array(labels.length);
  const blobs: Blob[] = [];
  const stack: number[] = [];

  for (let start = 0; start < labels.length; start++) {
    const colorIndex = labels[start]!;
    if (colorIndex < 0 || visited[start]) continue;

    stack.length = 0;
    stack.push(start);
    visited[start] = 1;
    let area = 0;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;

    while (stack.length > 0) {
      const idx = stack.pop()!;
      const x = idx % width;
      const y = (idx / width) | 0;
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      const neighbors = [idx - 1, idx + 1, idx - width, idx + width];
      for (const n of neighbors) {
        if (n < 0 || n >= labels.length) continue;
        if (x === 0 && n === idx - 1) continue;
        if (x === width - 1 && n === idx + 1) continue;
        if (visited[n] || labels[n] !== colorIndex) continue;
        visited[n] = 1;
        stack.push(n);
      }
    }

    if (area >= minArea) {
      blobs.push({ colorIndex, area, minX, maxX, minY, maxY });
    }
  }
  return blobs;
}

/** Counts brightness-gradient peaks up the middle of a blob — one per chip rim. */
function estimateByEdges(gray: Float32Array, width: number, blob: Blob): number {
  const cx = Math.round((blob.minX + blob.maxX) / 2);
  const halfSpan = Math.max(1, Math.round((blob.maxX - blob.minX) / 4));
  const rows: number[] = [];
  for (let y = blob.minY; y <= blob.maxY; y++) {
    let sum = 0;
    let n = 0;
    for (let x = Math.max(blob.minX, cx - halfSpan); x <= Math.min(blob.maxX, cx + halfSpan); x++) {
      const above = gray[(y - 1) * width + x];
      const below = gray[Math.min(blob.maxY, y + 1) * width + x];
      if (above !== undefined && below !== undefined) {
        sum += Math.abs(below - above);
        n++;
      }
    }
    rows.push(n > 0 ? sum / n : 0);
  }

  const chipDiameterPx = blob.maxX - blob.minX + 1;
  const minSpacingPx = Math.max(2, Math.round(chipDiameterPx * CHIP_THICKNESS_TO_DIAMETER * 0.6));
  const threshold = (Math.max(...rows, 0) || 1) * 0.35;

  let peaks = 0;
  let lastPeakRow = -Infinity;
  for (let i = 1; i < rows.length - 1; i++) {
    if (rows[i]! > threshold && rows[i]! >= rows[i - 1]! && rows[i]! >= rows[i + 1]!) {
      if (i - lastPeakRow >= minSpacingPx) {
        peaks++;
        lastPeakRow = i;
      }
    }
  }
  return peaks;
}

function estimateByGeometry(blob: Blob): number {
  const width = blob.maxX - blob.minX + 1;
  const height = blob.maxY - blob.minY + 1;
  const chipThicknessPx = Math.max(1, width * CHIP_THICKNESS_TO_DIAMETER);
  return Math.max(1, Math.round(height / chipThicknessPx));
}

export interface CountResult {
  counts: Record<ChipColorId, number>;
  /** Bounding boxes of everything the heuristic found, for an optional debug overlay. */
  blobs: { colorId: ChipColorId; count: number; minX: number; minY: number; maxX: number; maxY: number }[];
}

export async function countChipStacks(image: CanvasImageSource, srcW: number, srcH: number, palette: ChipColor[]): Promise<CountResult> {
  const counts: Record<ChipColorId, number> = {};
  for (const color of palette) counts[color.id] = 0;
  if (palette.length === 0) return { counts, blobs: [] };

  const { ctx, width, height } = drawDownscaled(image, srcW, srcH);
  const { data } = ctx.getImageData(0, 0, width, height);

  const paletteRgb = palette.map((c) => hexToRgb(c.hex));
  const labels = classifyPixels(data, width, height, paletteRgb);

  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = 0.299 * data[p]! + 0.587 * data[p + 1]! + 0.114 * data[p + 2]!;
  }

  const minArea = Math.max(24, Math.round(width * height * MIN_BLOB_AREA_FRACTION));
  const blobs = findBlobs(labels, width, height, minArea);

  const resultBlobs: CountResult['blobs'] = [];
  for (const blob of blobs) {
    const color = palette[blob.colorIndex]!;
    const geometryGuess = estimateByGeometry(blob);
    const edgeGuess = estimateByEdges(gray, width, blob);
    // Trust the edge count when it's in the right ballpark; otherwise the
    // stack is too small/blurry for rim detection and geometry is safer.
    const count = edgeGuess > 0 && edgeGuess <= geometryGuess * 1.6 && edgeGuess >= geometryGuess * 0.4 ? edgeGuess : geometryGuess;
    counts[color.id] = (counts[color.id] ?? 0) + count;
    resultBlobs.push({ colorId: color.id, count, minX: blob.minX, minY: blob.minY, maxX: blob.maxX, maxY: blob.maxY });
  }

  return { counts, blobs: resultBlobs };
}
