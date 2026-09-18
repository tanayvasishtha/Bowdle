#!/usr/bin/env node
/** Draw install icons into public/icons (LEFT-F3). */
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "icons");
mkdirSync(outDir, { recursive: true });

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

function pngRGB(size, paint) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = paint(x, y, size);
      const i = row + 1 + x * 3;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function iconPaint(x, y, size) {
  const parchment = [239, 227, 198];
  const ink = [74, 53, 39];
  const accent = [210, 83, 31];
  const cx = size / 2, cy = size / 2;
  const nx = (x - cx) / size, ny = (y - cy) / size;
  // rounded parchment square
  if (Math.max(Math.abs(nx), Math.abs(ny)) > 0.46) return [0, 0, 0];
  // bow arc
  const r = Math.hypot(nx * 1.1, ny);
  if (Math.abs(r - 0.28) < 0.035 && nx < 0.05) return accent;
  // string
  if (Math.abs(nx - 0.05) < 0.02 && Math.abs(ny) < 0.28) return ink;
  // arrow
  if (Math.abs(ny) < 0.02 && nx > -0.05 && nx < 0.38) return ink;
  if (nx > 0.34 && Math.hypot(nx - 0.38, ny) < 0.05) return accent;
  return parchment;
}

for (const size of [192, 512]) {
  const file = join(outDir, `icon-${size}.png`);
  writeFileSync(file, pngRGB(size, iconPaint));
  console.log("wrote", file);
}
