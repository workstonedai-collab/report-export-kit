import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { exportReport, validateDocument } from "../src/index.js";
import { barChart } from "../src/charts.js";
const document = {
  title: "中文报告 & Export",
  version: 2,
  blocks: [
    { type: "heading", text: "分析" },
    { type: "paragraph", text: "原始内容不应被改写。" },
    {
      type: "table",
      title: "示例",
      headers: ["期间", "数值"],
      rows: [
        ["2025", 0],
        ["2026", "缺失"],
      ],
    },
  ],
  sources: [{ title: "Example source", url: "https://example.org/data" }],
};
test("exports three formats without mutating input", async () => {
  const before = JSON.stringify(document);
  const results = await Promise.all(
    ["md", "docx", "pdf"].map((f) => exportReport(document, f)),
  );
  assert.equal(JSON.stringify(document), before);
  for (const r of results) {
    assert.ok(r.bytes > 100);
    assert.equal(r.version, 2);
    assert.match(r.sha256, /^[a-f0-9]{64}$/);
  }
  assert.match(results[0].content.toString(), /\| 2025 \| 0 \|/);
  assert.match(results[2].content.toString("latin1", 0, 5), /^%PDF/);
  const zip = await JSZip.loadAsync(results[1].content),
    xml = await zip.file("word/document.xml").async("string");
  assert.match(xml, /中文报告 &amp; Export/);
  assert.match(xml, /<w:tbl>/);
  assert.match(xml, /example.org/);
});
test("rejects malformed tables, source schemes and image content", () => {
  assert.throws(() =>
    validateDocument({
      ...document,
      blocks: [{ type: "table", headers: ["a"], rows: [[1, 2]] }],
    }),
  );
  assert.throws(() =>
    validateDocument({
      ...document,
      sources: [{ title: "x", url: "javascript:alert(1)" }],
    }),
  );
  assert.throws(() =>
    validateDocument({
      ...document,
      blocks: [{ type: "image", data: "YWJj" }],
    }),
  );
});
test("rejects unsupported formats and versions", async () => {
  await assert.rejects(exportReport(document, "html"));
  assert.throws(() => validateDocument({ ...document, version: -1 }));
});
test("long bilingual tables render across multiple PDF pages", async () => {
  const d = {
    ...document,
    blocks: [
      {
        type: "table",
        headers: ["编号", "说明"],
        rows: Array.from({ length: 90 }, (_, i) => [
          i,
          "这是需要换行的中文内容。Long English content with layout.",
        ]),
      },
    ],
  };
  const result = await exportReport(d, "pdf");
  assert.ok(result.bytes > 1000);
  assert.ok(
    (result.content.toString("latin1").match(/\/Type \/Page\b/g) || []).length >
      1,
  );
});
test("embeds chart pixels in PDF and DOCX and exports a Markdown sidecar", async () => {
  const png = barChart([12, 15, 9], { width: 300, height: 120 });
  const input = {
    ...document,
    blocks: [
      ...document.blocks,
      {
        type: "image",
        data: png.toString("base64"),
        title: "趋势 / Trend",
        note: "Synthetic counts: 12, 15, 9.",
      },
    ],
  };
  const [md, word, pdf] = await Promise.all(
    ["md", "docx", "pdf"].map((f) => exportReport(input, f)),
  );
  assert.equal(md.assets.length, 1);
  assert.equal(md.assets[0].filename, "figure-1.png");
  assert.deepEqual(md.assets[0].content, png);
  assert.match(md.content.toString(), /figure-1\.png/);
  const zip = await JSZip.loadAsync(word.content);
  assert.deepEqual(
    await zip.file("word/media/figure-1.png").async("nodebuffer"),
    png,
  );
  assert.match(
    await zip.file("word/document.xml").async("string"),
    /r:embed="img1"/,
  );
  assert.match(pdf.content.toString("latin1"), /\/Subtype \/Image/);
  assert.throws(() => barChart([-1]));
  assert.throws(() => barChart([NaN]));
});
