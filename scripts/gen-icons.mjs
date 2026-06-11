// Generates the PWA icons (two stacked "stones" on a dark slate background)
// as PNGs without any image library: raw RGBA rows → zlib deflate → PNG chunks.
// Run once: `npm run icons` (outputs are committed).
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

const CRC_TABLE = (() => {
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
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeData));
  return Buffer.concat([len, typeData, crc]);
}

function png(size, drawPixel) {
  const stride = 1 + size * 4;
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = drawPixel(x, y);
      const o = y * stride + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const BG = [242, 237, 226, 255]; // warm cream #f2ede2
const STONE_BIG = [22, 30, 54, 255]; // ink navy #161e36
const STONE_SMALL = [125, 119, 104, 255]; // warm gray #7d7768
const DOT = [177, 18, 38, 255]; // crimson #b11226

function inEllipse(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

function drawIcon(size) {
  return png(size, (x, y) => {
    // big stone, slightly squashed, lower center
    if (inEllipse(x, y, size * 0.5, size * 0.62, size * 0.32, size * 0.24)) {
      return STONE_BIG;
    }
    // small stone resting on top
    if (inEllipse(x, y, size * 0.5, size * 0.33, size * 0.19, size * 0.14)) {
      return STONE_SMALL;
    }
    // crimson dot — the BQT motif
    if (inEllipse(x, y, size * 0.78, size * 0.2, size * 0.05, size * 0.05)) {
      return DOT;
    }
    return BG;
  });
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "icon-192.png"), drawIcon(192));
writeFileSync(join(OUT_DIR, "icon-512.png"), drawIcon(512));
writeFileSync(join(OUT_DIR, "apple-touch-icon.png"), drawIcon(180));
console.log("icons written to", OUT_DIR);
