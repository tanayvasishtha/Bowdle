#!/usr/bin/env node
/** Draw public/og.png 1200x630 parchment card (LEFT-F3). */
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "og.png");
mkdirSync(join(root, "public"), { recursive: true });

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

const W = 1200, H = 630;
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) {
  const row = y * (W * 3 + 1);
  raw[row] = 0;
  for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    let r = 172 + u * 20, g = 217 - v * 30, b = 223 - v * 40; // sky wash
    if (v > 0.55) { r = 239; g = 227; b = 198; } // parchment ground
    if (v > 0.55 && v < 0.58) { r = 74; g = 53; b = 39; }
    // title bar block
    if (u > 0.08 && u < 0.72 && v > 0.28 && v < 0.48) { r = 239; g = 227; b = 198; }
    if (u > 0.08 && u < 0.72 && (Math.abs(v - 0.28) < 0.008 || Math.abs(v - 0.48) < 0.008 || Math.abs(u - 0.08) < 0.004 || Math.abs(u - 0.72) < 0.004)) {
      r = 74; g = 53; b = 39;
    }
    // sun disc
    if (Math.hypot(u - 0.82, v - 0.28) < 0.09) { r = 226; g = 149; b = 48; }
    const i = row + 1 + x * 3;
    raw[i] = r; raw[i + 1] = g; raw[i + 2] = b;
  }
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
writeFileSync(out, Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]));
console.log("wrote", out, "1200x630");
