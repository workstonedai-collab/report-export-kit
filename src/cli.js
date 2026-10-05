#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright 2026 workstonedai-collab
import fs from "node:fs/promises";
import path from "node:path";
import { exportReport } from "./index.js";
const [input, out = "output", fontPath] = process.argv.slice(2);
if (!input) {
  console.error("Usage: node src/cli.js report.json output-folder [font-path]");
  process.exit(1);
}
try {
  const document = JSON.parse(await fs.readFile(input, "utf8"));
  await fs.mkdir(out, { recursive: true });
  for (const format of ["pdf", "docx", "md"]) {
    const result = await exportReport(document, format, { fontPath });
    await fs.writeFile(path.join(out, "report." + format), result.content);
    for (const asset of result.assets)
      await fs.writeFile(path.join(out, asset.filename), asset.content);
    console.log(
      JSON.stringify({ format, bytes: result.bytes, sha256: result.sha256 }),
    );
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
