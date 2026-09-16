// Generates the PWA/app icons as plain PNGs, with zero image-library
// dependencies (just node:zlib for DEFLATE + a hand-rolled CRC32/PNG writer).
// Run with: node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Felt-green rounded square with a two-tone poker chip disc — the app icon. */
function drawIcon(size, { opaque } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const cornerR = size * 0.22;
  const chipR = size * 0.34;
  const ringR = chipR * 0.72;
  const dotR = size * 0.045;

  const felt = [21, 92, 62, 255]; // #155c3e
  const feltEdge = [15, 66, 45, 255];
  const white = [245, 245, 240, 255];
  const red = [196, 42, 42, 255];

  function insideRoundedSquare(x, y) {
    if (opaque) return true;
    const dx = Math.max(0, Math.abs(x - cx) - (size / 2 - cornerR));
    const dy = Math.max(0, Math.abs(y - cy) - (size / 2 - cornerR));
    return dx * dx + dy * dy <= cornerR * cornerR || (Math.abs(x - cx) <= size / 2 - cornerR || Math.abs(y - cy) <= size / 2 - cornerR);
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      let color;
      if (!insideRoundedSquare(x + 0.5, y + 0.5)) {
        color = [0, 0, 0, 0];
      } else if (dist <= chipR) {
        const onEdgeNotch = dist > chipR * 0.86 && Math.floor((Math.atan2(y - cy, x - cx) + Math.PI) / (Math.PI / 8)) % 2 === 0;
        color = onEdgeNotch ? white : dist <= ringR ? red : white;
      } else if (dist <= chipR + size * 0.01) {
        color = feltEdge;
      } else {
        color = felt;
      }
      rgba[i] = color[0];
      rgba[i + 1] = color[1];
      rgba[i + 2] = color[2];
      rgba[i + 3] = color[3];
    }
  }
  return rgba;
}

const outDir = new URL('../client/public/icons/', import.meta.url);
mkdirSync(outDir, { recursive: true });

for (const size of [64, 180, 192, 512]) {
  const opaque = size === 180; // apple-touch-icon: no transparency
  const png = encodePng(size, size, drawIcon(size, { opaque }));
  const name = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`;
  writeFileSync(new URL(name, outDir), png);
  console.log('wrote', name);
}

// Maskable icon: same art, but the disc kept well inside the safe zone.
const maskableSize = 512;
const png = encodePng(maskableSize, maskableSize, drawIcon(maskableSize, { opaque: true }));
writeFileSync(new URL('icon-maskable-512.png', outDir), png);
console.log('wrote icon-maskable-512.png');
