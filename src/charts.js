// SPDX-License-Identifier: MIT
// Copyright 2026 workstonedai-collab
import { deflateSync } from "node:zlib";
const crc = (b) => {
  let c = 0xffffffff;
  for (const v of b) {
    c ^= v;
    for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const name = Buffer.from(type),
    length = Buffer.alloc(4),
    check = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  check.writeUInt32BE(crc(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, check]);
};
/** Simple local PNG chart. Keep exact numbers, units and labels in an adjacent table/caption. */
export function barChart(values, { width = 600, height = 240 } = {}) {
  if (
    !Array.isArray(values) ||
    !values.length ||
    values.length > 30 ||
    values.some((v) => typeof v !== "number" || !Number.isFinite(v) || v < 0) ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 100 ||
    height < 100 ||
    width > 2000 ||
    height > 2000
  )
    throw Error("Use 1–30 non-negative values and a 100–2000 pixel canvas");
  const raw = Buffer.alloc(height * (width * 3 + 1)),
    max = Math.max(1, ...values),
    left = 35,
    bottom = height - 25,
    top = 20,
    step = (width - 60) / values.length,
    bar = step * 0.55;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let color = [248, 250, 249];
      if (
        (y === bottom && x >= left) ||
        (x === left && y >= top && y <= bottom)
      )
        color = [173, 195, 187];
      for (let i = 0; i < values.length; i++)
        if (
          x >= left + step * i + step * 0.2 &&
          x < left + step * i + step * 0.2 + bar &&
          y < bottom &&
          y >= bottom - (values[i] / max) * (bottom - top)
        )
          color = [41, 125, 99];
      const at = y * (width * 3 + 1) + 1 + x * 3;
      raw[at] = color[0];
      raw[at + 1] = color[1];
      raw[at + 2] = color[2];
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
