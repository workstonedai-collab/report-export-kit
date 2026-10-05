// SPDX-License-Identifier: MIT
// Copyright 2026 workstonedai-collab
import fs from "node:fs/promises";
import { exportReport } from "../src/index.js";
import { barChart } from "../src/charts.js";
const png = barChart([12, 15, 9]).toString("base64");
const document = {
  title: "Field Notes / 公开资料笔记",
  version: 1,
  subtitle: "Synthetic example / 虚构示例",
  blocks: [
    { type: "heading", text: "Summary / 概览" },
    {
      type: "paragraph",
      text: "这是一份原创虚构报告，用于展示中文内容、表格与来源的多格式导出。This is a synthetic report demonstrating local rendering.",
    },
    {
      type: "table",
      title: "Sample observations / 示例观测",
      headers: ["Period / 期间", "Value / 数值", "Status / 状态"],
      rows: [
        ["2024", "12", "Historical / 历史"],
        ["2025", "15", "Estimate / 估计"],
        ["2026", "9", "Forecast / 预测"],
      ],
      note: "Numbers are invented. / 数值均为虚构。",
    },
    {
      type: "image",
      title: "Synthetic series / 虚构序列",
      data: png,
      note: "Values 12, 15, 9; all synthetic. / 数值 12、15、9，均为虚构。",
    },
  ],
  sources: [
    {
      title: "Synthetic source",
      publisher: "Example Publisher",
      url: "https://example.org/source",
      date: "2026-01-01",
    },
  ],
};
await fs.mkdir("output", { recursive: true });
await fs.writeFile("output/sample.json", JSON.stringify(document, null, 2));
for (const format of ["pdf", "docx", "md"]) {
  const result = await exportReport(document, format);
  await fs.writeFile("output/demo." + format, result.content);
  for (const asset of result.assets)
    await fs.writeFile("output/" + asset.filename, asset.content);
  console.log(format, result.bytes, result.sha256);
}
