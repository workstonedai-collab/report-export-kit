// SPDX-License-Identifier: MIT
// Copyright 2026 workstonedai-collab
import fs from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import JSZip from "jszip";
export { exportRecordWorkbook } from './records.js';

const text = (v) =>
  typeof v === "string"
    ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    : "";
const xml = (s) =>
  text(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
const url = (s) => {
  try {
    const u = new URL(s);
    return ["http:", "https:"].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
};
const fail = (m) => {
  throw new Error(m);
};
export function validateDocument(input) {
  if (
    !input ||
    typeof input.title !== "string" ||
    !input.title.trim() ||
    input.title.length > 1000 ||
    !Array.isArray(input.blocks) ||
    input.blocks.length > 1000
  )
    fail("A title and at most 1000 blocks are required");
  if (
    input.version !== undefined &&
    (!Number.isSafeInteger(input.version) || input.version < 1)
  )
    fail("Version must be a positive integer");
  const blocks = input.blocks.map((b) => {
    if (!b || typeof b !== "object") fail("Invalid block");
    if (["heading", "paragraph"].includes(b.type)) {
      if (typeof b.text !== "string" || b.text.length > 200000)
        fail("Block text must be a string of at most 200000 characters");
      if (
        b.type === "heading" &&
        b.level !== undefined &&
        ![1, 2, 3].includes(b.level)
      )
        fail("Heading level must be 1, 2 or 3");
      return { type: b.type, text: text(b.text), level: b.level || 1 };
    }
    if (b.type === "table") {
      if (
        !Array.isArray(b.headers) ||
        !b.headers.length ||
        b.headers.length > 12 ||
        !Array.isArray(b.rows) ||
        b.rows.length > 2000
      )
        fail("Table must have 1–12 headers and at most 2000 rows");
      const cell = (v) => {
        if (
          !["string", "number"].includes(typeof v) ||
          (typeof v === "number" && !Number.isFinite(v)) ||
          String(v).length > 10000
        )
          fail("Invalid table cell");
        return text(String(v));
      };
      return {
        type: "table",
        title: text(b.title),
        headers: b.headers.map(cell),
        rows: b.rows.map((row) => {
          if (!Array.isArray(row) || row.length !== b.headers.length)
            fail("Table row width must match headers");
          return row.map(cell);
        }),
        note: text(b.note),
      };
    }
    if (b.type === "image") {
      if (
        typeof b.data !== "string" ||
        b.data.length > 12000000 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(b.data)
      )
        fail("Image must be PNG base64 (at most 9 MB)");
      const buf = Buffer.from(b.data, "base64");
      if (
        buf.length < 24 ||
        !buf
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      )
        fail("Only PNG images are supported");
      const width = buf.readUInt32BE(16),
        height = buf.readUInt32BE(20);
      if (!width || !height || width * height > 40000000)
        fail("Image dimensions are too large");
      return {
        type: "image",
        data: b.data,
        width,
        height,
        title: text(b.title),
        note: text(b.note),
      };
    }
    fail("Supported block types: heading, paragraph, table, image");
  });
  const sources = (input.sources || []).map((s) => {
    if (!s || typeof s.title !== "string" || !url(s.url))
      fail("Sources need a title and an HTTP(S) URL");
    return {
      title: text(s.title),
      url: url(s.url),
      publisher: text(s.publisher),
      date: text(s.date),
    };
  });
  if (sources.length > 1000 || JSON.stringify(blocks).length > 24000000)
    fail("Document is too large");
  return {
    schema_version: 1,
    title: text(input.title),
    version: input.version || 1,
    subtitle: text(input.subtitle),
    blocks,
    sources,
  };
}
const sourceLine = (s, i) =>
  `${i + 1}. ${s.title}${s.publisher ? " · " + s.publisher : ""}${s.date ? " · " + s.date : ""}\n${s.url}`;
const escapeMarkdown = (s) =>
  s.replace(/\\/g, "\\\\").replace(/([`*_\[\]<>])/g, "\\$1");
function markdown(doc) {
  const out = ["# " + escapeMarkdown(doc.title), escapeMarkdown(doc.subtitle)],
    assets = [];
  let n = 0;
  for (const b of doc.blocks) {
    if (b.type === "heading")
      out.push("#".repeat(b.level + 1) + " " + escapeMarkdown(b.text));
    if (b.type === "paragraph") out.push(escapeMarkdown(b.text));
    if (b.type === "table") {
      const cell = (s) =>
        escapeMarkdown(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
      out.push(
        "**" + escapeMarkdown(b.title) + "**",
        "| " +
          b.headers.map(cell).join(" | ") +
          " |\n| " +
          b.headers.map(() => "---").join(" | ") +
          " |\n" +
          b.rows.map((r) => "| " + r.map(cell).join(" | ") + " |").join("\n"),
        escapeMarkdown(b.note),
      );
    }
    if (b.type === "image") {
      const name = `figure-${++n}.png`;
      assets.push({ filename: name, content: Buffer.from(b.data, "base64") });
      out.push(
        `![${escapeMarkdown(b.title)}](${name})`,
        escapeMarkdown(b.note),
      );
    }
  }
  if (doc.sources.length)
    out.push(
      "## Sources / 参考来源",
      ...doc.sources.map((s, i) => sourceLine(s, i)),
    );
  return {
    content: Buffer.from(out.filter(Boolean).join("\n\n") + "\n"),
    assets,
  };
}
async function pdf(doc, options) {
  const bundled = fileURLToPath(
    new URL("../fonts/NotoSansCJKsc-Regular.otf", import.meta.url),
  );
  const fontPath =
    options.fontPath || (fs.existsSync(bundled) ? bundled : null);
  const visible = JSON.stringify({
    ...doc,
    blocks: doc.blocks.map((b) => ({ ...b, data: undefined })),
  });
  if (!fontPath && /[^\x00-\x7f]/.test(visible))
    fail(
      "Non-ASCII PDF text needs a font: run npm run setup-font or pass fontPath",
    );
  const p = new PDFDocument({
      size: "A4",
      margins: { top: 54, bottom: 54, left: 54, right: 54 },
      bufferPages: true,
      info: { Title: doc.title, Author: options.author || "" },
    }),
    chunks = [];
  const result = new Promise((resolve, reject) => {
    p.on("data", (b) => chunks.push(b));
    p.on("end", () => resolve(Buffer.concat(chunks)));
    p.on("error", reject);
  });
  if (fontPath) p.registerFont("Body", fontPath).font("Body");
  else p.font("Helvetica");
  const width = p.page.width - 108,
    ink = options.color || "#193E40";
  const reserve = (h) => {
    if (p.y + h > p.page.height - 58) p.addPage();
  };
  const paragraph = (value, size = 11, color = "#293A3C") => {
    if (!value) return;
    p.fontSize(size).fillColor(color);
    p.text(value, 54, p.y, { width, lineGap: 4 });
    p.moveDown(0.65);
  };
  paragraph(doc.title, 23, ink);
  paragraph(doc.subtitle, 10, "#5D7274");
  for (const b of doc.blocks) {
    if (b.type === "heading") {
      reserve(70);
      paragraph(b.text, b.level === 1 ? 16 : 13, ink);
    }
    if (b.type === "paragraph") paragraph(b.text);
    if (b.type === "table") {
      reserve(70);
      paragraph(b.title, 12, ink);
      const rowWidth = width / b.headers.length;
      const row = (cells, header = false) => {
        p.fontSize(header ? 9 : 10);
        const height =
          Math.max(
            ...cells.map((c) =>
              p.heightOfString(c, { width: rowWidth - 12, lineGap: 3 }),
            ),
          ) + 16;
        if (height > p.page.height - 115) {
          paragraph(
            cells.map((c, i) => b.headers[i] + ": " + c).join("\n"),
            10,
          );
          return;
        }
        if (p.y + height > p.page.height - 58) {
          p.addPage();
          if (!header) row(b.headers, true);
        }
        const y = p.y;
        cells.forEach((c, i) => {
          p.fillColor(ink).text(c, 54 + i * rowWidth + 6, y + 7, {
            width: rowWidth - 12,
            lineGap: 3,
          });
        });
        p.strokeColor("#D1DEDC")
          .moveTo(54, y + height)
          .lineTo(54 + width, y + height)
          .stroke();
        p.y = y + height;
      };
      row(b.headers, true);
      b.rows.forEach((r) => row(r));
      p.moveDown(0.6);
      paragraph(b.note, 9, "#5D7274");
    }
    if (b.type === "image") {
      const h = Math.min((width * b.height) / b.width, p.page.height - 190),
        w = (h * b.width) / b.height;
      reserve(h + 75);
      paragraph(b.title, 12, ink);
      const y = p.y;
      p.image(Buffer.from(b.data, "base64"), 54 + (width - w) / 2, y, {
        width: w,
        height: h,
      });
      p.y = y + h + 8;
      paragraph(b.note, 9, "#5D7274");
    }
  }
  if (doc.sources.length) {
    reserve(70);
    paragraph(fontPath ? "Sources / 参考来源" : "Sources", 16, ink);
    doc.sources.forEach((s, i) => paragraph(sourceLine(s, i), 9));
  }
  const range = p.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    p.switchToPage(i);
    p.fontSize(8)
      .fillColor("#647976")
      .text(
        `v${doc.version}  ·  ${i + 1} / ${range.count}`,
        54,
        p.page.height - 35,
        { lineBreak: false },
      );
  }
  p.end();
  return { content: await result, assets: [] };
}
const para = (s, style = "Normal") =>
  `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t xml:space="preserve">${xml(s).replace(/\n/g, '</w:t><w:br/><w:t xml:space="preserve">')}</w:t></w:r></w:p>`;
async function docx(doc) {
  const zip = new JSZip(),
    rels = [],
    body = [para(doc.title, "Title"), para(doc.subtitle)],
    types = [];
  let n = 0;
  for (const b of doc.blocks) {
    if (b.type === "heading")
      body.push(para(b.text, "Heading" + Math.min(b.level, 2)));
    if (b.type === "paragraph") body.push(para(b.text));
    if (b.type === "table")
      body.push(
        para(b.title, "Heading2"),
        `<w:tbl><w:tblPr><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map((k) => `<w:${k} w:val="single" w:sz="4" w:color="D1DEDC"/>`).join("")}</w:tblBorders></w:tblPr>${[b.headers, ...b.rows].map((row, i) => `<w:tr>${i === 0 ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${row.map((c) => `<w:tc>${para(c)}</w:tc>`).join("")}</w:tr>`).join("")}</w:tbl>`,
        para(b.note, "Caption"),
      );
    if (b.type === "image") {
      n++;
      const filename = `figure-${n}.png`;
      zip.file("word/media/" + filename, Buffer.from(b.data, "base64"));
      rels.push(
        `<Relationship Id="img${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${filename}"/>`,
      );
      const cx = Math.min(5943600, (7200000 * b.width) / b.height),
        cy = Math.round((cx * b.height) / b.width);
      body.push(
        para(b.title, "Heading2"),
        `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="${Math.round(cx)}" cy="${cy}"/><wp:docPr id="${n}" name="${xml(b.title || filename)}" descr="${xml(b.note)}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${n}" name="${filename}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="img${n}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${Math.round(cx)}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`,
        para(b.note, "Caption"),
      );
    }
  }
  if (doc.sources.length)
    body.push(
      para("Sources / 参考来源", "Heading1"),
      ...doc.sources.map((s, i) => para(sourceLine(s, i), "Caption")),
    );
  zip.file(
    "[Content_Types].xml",
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>${["document", "styles"].map((k) => `<Override PartName="/word/${k}.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${k === "document" ? "document.main" : "styles"}+xml"/>`).join("")}</Types>`,
  );
  zip.file(
    "_rels/.rels",
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="doc" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    "word/document.xml",
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1080" w:bottom="1080" w:left="1080" w:right="1080"/></w:sectPr></w:body></w:document>`,
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}<Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  zip.file(
    "word/styles.xml",
    `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:eastAsia="Noto Sans CJK SC"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>${[
      ["Normal", 22],
      ["Title", 42],
      ["Heading1", 32],
      ["Heading2", 26],
      ["Caption", 18],
    ]
      .map(
        ([id, size]) =>
          `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${id}"/><w:pPr><w:spacing w:after="160"/>${id.startsWith("Heading") ? "<w:keepNext/>" : ""}</w:pPr><w:rPr><w:sz w:val="${size}"/></w:rPr></w:style>`,
      )
      .join("")}</w:styles>`,
  );
  return {
    content: await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
    }),
    assets: [],
  };
}
/** Local renderer: does not contact URLs or call an AI API. */
export async function exportReport(input, format, options = {}) {
  const doc = validateDocument(input);
  if (!["pdf", "docx", "md"].includes(format))
    fail("Format must be pdf, docx or md");
  const result = await { pdf, docx, md: markdown }[format](doc, options);
  return {
    ...result,
    format,
    version: doc.version,
    sha256: createHash("sha256").update(result.content).digest("hex"),
    bytes: result.content.length,
  };
}
