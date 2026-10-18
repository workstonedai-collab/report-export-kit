// SPDX-License-Identifier: MIT
// Copyright 2026 workstonedai-collab
import { createHash } from 'node:crypto';
import JSZip from 'jszip';

const digest = value => createHash('sha256').update(value).digest('hex');
function xml(value) {
  const text = String(value);
  if (text.length > 32767) throw new Error('Cell exceeds the XLSX text limit');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text) ||
      [...text].some(c => c.codePointAt(0) >= 0xd800 && c.codePointAt(0) <= 0xdfff)) {
    throw new Error('Text contains characters unsupported by XML; input was not truncated or changed');
  }
  return text.replace(/[&<>"'\r]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;', '\r': '&#13;' })[c]);
}
function parts(text) {
  const result = []; let part = '';
  for (const char of text) {
    if (part.length + char.length > 30000) { result.push(part); part = ''; }
    part += char;
  }
  result.push(part); return result;
}
function leaves(value, pointer = '', ancestors = new Set()) {
  if (value === null || ['string', 'boolean'].includes(typeof value) || (typeof value === 'number' && Number.isFinite(value))) {
    return [[pointer, typeof value === 'string' ? value : JSON.stringify(value), value === null ? 'null' : typeof value]];
  }
  if (!value || typeof value !== 'object' || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) || ancestors.has(value)) {
    throw new Error('Fields must contain acyclic JSON values with finite numbers');
  }
  const next = new Set(ancestors).add(value), entries = Object.entries(value);
  if (!entries.length) return [[pointer, JSON.stringify(value), Array.isArray(value) ? 'array' : 'object']];
  return entries.flatMap(([key, item]) => leaves(item, pointer + '/' + key.replace(/~/g, '~0').replace(/\//g, '~1'), next));
}
function sheet(rows) {
  return '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
    rows.map((row, i) => `<row r="${i + 1}">` + row.map((cell, j) =>
      `<c r="${String.fromCharCode(65 + j)}${i + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(cell)}</t></is></c>`).join('') + '</row>').join('') +
    '</sheetData></worksheet>';
}

/** Snapshot export: all user cells are text, long values split without truncation. */
export async function exportRecordWorkbook(records) {
  if (!Array.isArray(records) || !records.length || records.length > 1000) throw new Error('Supply 1..1000 versioned records');
  const seen = new Set(), overview = [['Record ID', 'Version', 'Source', 'Field count']], detail = [['Record ID', 'Version', 'JSON Pointer', 'Type', 'Part', 'Parts', 'Text']];
  for (const record of records) {
    if (!record || typeof record.id !== 'string' || !record.id || record.id.length > 2000 ||
        !((Number.isSafeInteger(record.version) && record.version > 0) || (typeof record.version === 'string' && record.version.length > 0 && record.version.length <= 100)) ||
        !record.fields || typeof record.fields !== 'object' || Array.isArray(record.fields)) throw new Error('Each record needs id, version and a fields object');
    const identity = JSON.stringify([record.id, record.version]);
    if (seen.has(identity)) throw new Error('Duplicate record ID and version'); seen.add(identity);
    if (record.source !== undefined && (typeof record.source !== 'string' || record.source.length > 2000)) throw new Error('Source must be a string of at most 2000 characters');
    const fields = leaves(record.fields);
    overview.push([record.id, record.version, record.source || '', fields.length]);
    for (const [pointer, value, type] of fields) {
      const chunks = parts(value);
      chunks.forEach((chunk, index) => detail.push([record.id, record.version, pointer, type, index + 1, chunks.length, chunk]));
      if (detail.length > 50001) throw new Error('Export exceeds 50000 field parts');
    }
  }
  const snapshot = JSON.stringify(records);
  if (Buffer.byteLength(snapshot) > 10000000) throw new Error('Snapshot exceeds 10 MB');
  const inputSha256 = digest(snapshot), zip = new JSZip(), date = new Date('1980-01-01T00:00:00Z');
  const files = {
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' + [1, 2, 3].map(i => `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>',
    '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + ['Records', 'Fields', 'Manifest'].map((name, i) => `<sheet name="${name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + [1, 2, 3].map(i => `<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`).join('') + '</Relationships>',
    'xl/worksheets/sheet1.xml': sheet(overview),
    'xl/worksheets/sheet2.xml': sheet(detail),
    'xl/worksheets/sheet3.xml': sheet([['Schema', 'record-workbook-v1'], ['Input SHA-256', inputSha256], ['Records', records.length], ['Field parts', detail.length - 1], ['Rule', 'Text cells; join Text by Record ID, Version, JSON Pointer and numeric Part. No fetching or latest-version substitution.']]),
  };
  for (const [name, value] of Object.entries(files)) zip.file(name, value, { date, createFolders: false });
  const content = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return { content, sha256: digest(content), inputSha256, recordCount: records.length, fieldPartCount: detail.length - 1, assets: [] };
}
