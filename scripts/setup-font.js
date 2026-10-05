// SPDX-License-Identifier: MIT
// Copyright 2026 workstonedai-collab
import fs from "node:fs/promises";
const resources = [
  [
    "NotoSansCJKsc-Regular.otf",
    "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf",
  ],
  [
    "OFL.txt",
    "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/LICENSE",
  ],
];
await fs.mkdir(new URL("../fonts/", import.meta.url), { recursive: true });
for (const [name, url] of resources) {
  const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw Error("Font download HTTP " + r.status);
  const bytes = Buffer.from(await r.arrayBuffer());
  if (name.endsWith(".otf") && bytes.subarray(0, 4).toString() !== "OTTO")
    throw Error("Invalid font");
  const file = new URL("../fonts/" + name, import.meta.url),
    temp = new URL("../fonts/" + name + ".download", import.meta.url);
  await fs.writeFile(temp, bytes);
  await fs.rename(temp, file);
  console.log(name, bytes.length);
}
