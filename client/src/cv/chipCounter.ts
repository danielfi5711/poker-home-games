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
 *  1. Corrects large-scale lighting gradients (a lamp on one side of the
 *     table, a shadow across a corner) with a coarse local white-balance
 *     pass, so color classification doesn't drift across the photo.
 *  2. Classifies every pixel to the nearest color in the session's chip
 *     palette (or "background").
 *  3. Finds connected blobs per color — each blob is one or more stacks of
 *     that color touching each other (players often set same-color stacks
 *     side by side).
 *  4. Calibrates a single reference chip diameter (in px) from whichever
 *     blobs look like a single stack (taller than wide), then uses it to
 *     split any wider blob into that many side-by-side stacks instead of
 *     undercounting a merged blob as one.
 *  5. Estimates chips per stack two ways and reconciles them:
 *     - geometry: stack height ÷ an assumed chip-thickness-to-diameter
 *       ratio, using the calibrated diameter (falling back to the blob's
 *       own width when no calibration is available).
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

/**
 * Flattens large-scale lighting gradients (a lamp to one side, a shadow
 * across a corner of the table) before color classification. Splits the
 * image into a coarse grid, averages brightness per cell, then rescales
 * each pixel toward the image's overall average brightness by its cell's
 * ratio. The grid is coarse relative to a chip (12 cells across the short
 * side) so real chip-to-chip and rim edges within a stack survive; only the
 * slow, room-lighting-scale gradient gets corrected.
 */
function correctIllumination(pixels: Uint8ClampedArray, width: number, height: number): void {
  const cellSize = Math.max(8, Math.round(Math.min(width, height) / 12));
  const cols = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);
  const cellSum = new Float64Array(cols * rows);
  const cellCount = new Int32Array(cols * rows);

  for (let y = 0, p = 0; y < height; y++) {
    const cy = (y / cellSize) | 0;
    for (let x = 0; x < width; x++, p += 4) {
      const cx = (x / cellSize) | 0;
      const cell = cy * cols + cx;
      cellSum[cell]! += (pixels[p]! + pixels[p + 1]! + pixels[p + 2]!) / 3;
      cellCount[cell]!++;
    }
  }

  let globalSum = 0;
  let globalCount = 0;
  const cellAvg = new Float64Array(cols * rows);
  for (let c = 0; c < cellAvg.length; c++) {
    if (cellCount[c]! > 0) {
      cellAvg[c] = cellSum[c]! / cellCount[c]!;
      globalSum += cellSum[c]!;
      globalCount += cellCount[c]!;
    }
  }
  if (globalCount === 0) return;
  const globalAvg = globalSum / globalCount;

  for (let y = 0, p = 0; y < height; y++) {
    const cy = (y / cellSize) | 0;
    for (let x = 0; x < width; x++, p += 4) {
      const cx = (x / cellSize) | 0;
      const cell = cy * cols + cx;
      const avg = cellAvg[cell]!;
      if (avg <= 0) continue;
      const factor = Math.min(2, Math.max(0.5, globalAvg / avg));
      pixels[p] = Math.min(255, pixels[p]! * factor);
      pixels[p + 1] = Math.min(255, pixels[p + 1]! * factor);
      pixels[p + 2] = Math.min(255, pixels[p + 2]! * factor);
    }
  }
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

function estimateByGeometry(blob: Blob, diameterPx: number): number {
  const height = blob.maxY - blob.minY + 1;
  const chipThicknessPx = Math.max(1, diameterPx * CHIP_THICKNESS_TO_DIAMETER);
  return Math.max(1, Math.round(height / chipThicknessPx));
}

/**
 * A photo's chip diameter, in pixels, calibrated from whichever blobs look
 * like a single stack (taller than they are wide — merged side-by-side
 * stacks read as wider than any one stack is tall). Returns null when no
 * blob qualifies, so callers fall back to a blob's own width.
 */
function estimateReferenceDiameterPx(blobs: Blob[]): number | null {
  const widths = blobs.filter((b) => b.maxY - b.minY >= b.maxX - b.minX).map((b) => b.maxX - b.minX + 1);
  if (widths.length === 0) return null;
  widths.sort((a, b) => a - b);
  const mid = widths.length >> 1;
  return widths.length % 2 === 1 ? widths[mid]! : (widths[mid - 1]! + widths[mid]!) / 2;
}

/** Re-measures the actual y-extent of one color within an x-range of a blob — used to split a merged, multi-stack blob into its individual stacks, which may differ slightly in height. */
function measureBand(labels: Int16Array, width: number, colorIndex: number, bandMinX: number, bandMaxX: number, searchMinY: number, searchMaxY: number): Blob | null {
  let minY = Infinity;
  let maxY = -Infinity;
  for (let y = searchMinY; y <= searchMaxY; y++) {
    const rowBase = y * width;
    for (let x = bandMinX; x <= bandMaxX; x++) {
      if (labels[rowBase + x] === colorIndex) {
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        break;
      }
    }
  }
  if (minY > maxY) return null;
  return { colorIndex, area: (bandMaxX - bandMinX + 1) * (maxY - minY + 1), minX: bandMinX, maxX: bandMaxX, minY, maxY };
}

/** Splits a blob into `count` equal-width vertical bands — one per stack merged into it. */
function splitBlobIntoStacks(labels: Int16Array, width: number, blob: Blob, count: number): Blob[] {
  if (count <= 1) return [blob];
  const blobWidth = blob.maxX - blob.minX + 1;
  const bands: Blob[] = [];
  for (let i = 0; i < count; i++) {
    const bandMinX = blob.minX + Math.round((i * blobWidth) / count);
    const bandMaxX = i === count - 1 ? blob.maxX : blob.minX + Math.round(((i + 1) * blobWidth) / count) - 1;
    const band = measureBand(labels, width, blob.colorIndex, bandMinX, bandMaxX, blob.minY, blob.maxY);
    if (band) bands.push(band);
  }
  return bands.length > 0 ? bands : [blob];
}

export interface CountResult {
  counts: Record<ChipColorId, number>;
  /** Bounding boxes of every individual stack the heuristic found, for an optional debug overlay. */
  blobs: { colorId: ChipColorId; count: number; minX: number; minY: number; maxX: number; maxY: number }[];
  /** Pixel size of the analysis canvas the blob boxes above are in, so a caller can scale them onto the displayed photo. */
  imageWidth: number;
  imageHeight: number;
}

export async function countChipStacks(image: CanvasImageSource, srcW: number, srcH: number, palette: ChipColor[]): Promise<CountResult> {
  const counts: Record<ChipColorId, number> = {};
  for (const color of palette) counts[color.id] = 0;
  if (palette.length === 0) return { counts, blobs: [], imageWidth: 0, imageHeight: 0 };

  const { ctx, width, height } = drawDownscaled(image, srcW, srcH);
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;

  correctIllumination(data, width, height);

  const paletteRgb = palette.map((c) => hexToRgb(c.hex));
  const labels = classifyPixels(data, width, height, paletteRgb);

  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = 0.299 * data[p]! + 0.587 * data[p + 1]! + 0.114 * data[p + 2]!;
  }

  const minArea = Math.max(24, Math.round(width * height * MIN_BLOB_AREA_FRACTION));
  const blobs = findBlobs(labels, width, height, minArea);
  const referenceDiameterPx = estimateReferenceDiameterPx(blobs);

  const resultBlobs: CountResult['blobs'] = [];
  for (const blob of blobs) {
    const color = palette[blob.colorIndex]!;
    const blobWidth = blob.maxX - blob.minX + 1;
    const diameterPx = referenceDiameterPx ?? blobWidth;
    const stackCount = Math.max(1, Math.round(blobWidth / diameterPx));
    const stacks = splitBlobIntoStacks(labels, width, blob, stackCount);

    for (const stack of stacks) {
      const geometryGuess = estimateByGeometry(stack, diameterPx);
      const edgeGuess = estimateByEdges(gray, width, stack);
      // Trust the edge count when it's in the right ballpark; otherwise the
      // stack is too small/blurry for rim detection and geometry is safer.
      const count = edgeGuess > 0 && edgeGuess <= geometryGuess * 1.6 && edgeGuess >= geometryGuess * 0.4 ? edgeGuess : geometryGuess;
      counts[color.id] = (counts[color.id] ?? 0) + count;
      resultBlobs.push({ colorId: color.id, count, minX: stack.minX, minY: stack.minY, maxX: stack.maxX, maxY: stack.maxY });
    }
  }

  return { counts, blobs: resultBlobs, imageWidth: width, imageHeight: height };
}
