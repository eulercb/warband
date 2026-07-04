/**
 * Generates Warband PWA icons (public/icons/icon-192.png, icon-512.png) with no
 * image libraries: rasterize an RGBA buffer, then PNG-encode via zlib + CRC32.
 * Run: node scripts/gen-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

// CRC32 (PNG uses the standard IEEE polynomial).
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  // scanlines with filter byte 0
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function draw(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const bgTop = [0x16, 0x16, 0x22];
  const bgBot = [0x0a, 0x0a, 0x10];
  const panel = [0x1c, 0x1c, 0x2e];
  const gold = [0xf2, 0xc1, 0x4e];
  const red = [0xd9, 0x46, 0x3e];

  const rShield = size * 0.42;
  const rRingOuter = size * 0.46;
  const rRingInner = size * 0.4;

  // dragon-fang triangle
  const ax = cx,
    ay = cy - size * 0.26;
  const blx = cx - size * 0.22,
    bly = cy + size * 0.2;
  const brx = cx + size * 0.22,
    bry = cy + size * 0.2;
  const sign = (px, py, x1, y1, x2, y2) => (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);

      let col = mix(bgTop, bgBot, y / size);
      let a = 255;

      if (d <= rRingOuter) {
        if (d >= rRingInner) {
          col = gold; // ring
        } else if (d <= rShield) {
          // shield interior
          const inTri =
            sign(x, y, ax, ay, blx, bly) < 0 &&
            sign(x, y, blx, bly, brx, bry) < 0 &&
            sign(x, y, brx, bry, ax, ay) < 0;
          col = inTri ? red : panel;
        }
      }

      rgba[i] = col[0];
      rgba[i + 1] = col[1];
      rgba[i + 2] = col[2];
      rgba[i + 3] = a;
    }
  }
  return encodePng(size, size, rgba);
}

for (const size of [192, 512]) {
  const png = draw(size);
  const path = join(outDir, `icon-${size}.png`);
  writeFileSync(path, png);
  console.log(`wrote ${path} (${png.length} bytes)`);
}
