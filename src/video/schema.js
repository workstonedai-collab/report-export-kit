// SPDX-License-Identifier: MIT
// Copyright 2026 workstonedai-collab

/** Standalone, browser-safe validation for video projects. */
export function validateVideoProject(input) {
  const fail = (message) => {
    throw new Error(message);
  };

  const MAX_JSON_BYTES = 24 * 1024 * 1024;
  const MAX_TOTAL_FRAMES = 5400;
  const codePointLength = (value) => [...value].length;
  const byteLength = (value) => new TextEncoder().encode(value).length;
  const hasForbiddenControl = (value) => /[\u0000-\u0008\u000B-\u001F\u007F]/.test(value);

  const stringValue = (value, max, path, { nonEmpty = false } = {}) => {
    if (typeof value !== 'string') {
      fail(`${path} must be a string`);
    }
    if (hasForbiddenControl(value)) {
      fail(`${path} contains unsupported control characters`);
    }
    if (nonEmpty && value.trim() === '') {
      fail(`${path} must not be empty`);
    }
    if (codePointLength(value) > max) {
      fail(`${path} must be at most ${max} Unicode code points`);
    }
    return value;
  };

  const optionalString = (value, max, path) => {
    if (value === undefined || value === null) return '';
    return stringValue(value, max, path);
  };

  const positiveSafeInteger = (value, path) => {
    if (!Number.isSafeInteger(value) || value < 1) {
      fail(`${path} must be a positive safe integer`);
    }
    return value;
  };

  const httpUrl = (value, path) => {
    if (typeof value !== 'string') fail(`${path} must be a string`);
    if (codePointLength(value) > 220) {
      fail(`${path} must be at most 220 Unicode code points`);
    }
    if (hasForbiddenControl(value)) {
      fail(`${path} contains unsupported control characters`);
    }
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      fail(`${path} must be a valid HTTP(S) URL`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      fail(`${path} must use HTTP(S)`);
    }
    return parsed.href;
  };

  const pngImage = (value, path) => {
    if (typeof value !== 'string') fail(`${path}.data must be a base64 string`);
    if (value.length > 12000000) fail(`${path}.data exceeds the PNG size limit`);
    if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
      fail(`${path}.data must be canonical PNG base64`);
    }
    if (/={1}[^=]/.test(value) || /={3,}/.test(value)) {
      fail(`${path}.data must be canonical PNG base64`);
    }

    let binary;
    try {
      binary = atob(value);
    } catch {
      fail(`${path}.data must be canonical PNG base64`);
    }
    if (typeof btoa === 'function' && btoa(binary) !== value) {
      fail(`${path}.data must be canonical PNG base64`);
    }

    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (bytes.length < 33 || signature.some((byte, index) => bytes[index] !== byte)) {
      fail(`${path}.data is not a PNG image`);
    }

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const firstLength = view.getUint32(8);
    const firstType = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (firstLength !== 13 || firstType !== 'IHDR') {
      fail(`${path}.data has invalid PNG metadata`);
    }

    const width = view.getUint32(16);
    const height = view.getUint32(20);
    const bitDepth = bytes[24];
    const colorType = bytes[25];
    const compression = bytes[26];
    const filter = bytes[27];
    const interlace = bytes[28];
    const validDepths = {
      0: [1, 2, 4, 8, 16],
      2: [8, 16],
      3: [1, 2, 4, 8],
      4: [8, 16],
      6: [8, 16]
    };

    if (!width || !height || width * height > 40000000) {
      fail(`${path} has invalid or excessive PNG dimensions`);
    }
    if (!validDepths[colorType] || !validDepths[colorType].includes(bitDepth)) {
      fail(`${path} has invalid PNG bit depth or color type`);
    }
    if (compression !== 0 || filter !== 0 || (interlace !== 0 && interlace !== 1)) {
      fail(`${path} has invalid PNG metadata`);
    }

    let offset = 8;
    let sawData = false;
    let sawEnd = false;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset);
      const type = String.fromCharCode(
        bytes[offset + 4],
        bytes[offset + 5],
        bytes[offset + 6],
        bytes[offset + 7]
      );
      if (length > bytes.length || offset + 12 + length > bytes.length) {
        fail(`${path}.data has an invalid PNG chunk`);
      }
      if (type === 'IHDR' && offset !== 8) fail(`${path}.data has invalid PNG metadata`);
      if (type === 'IDAT') sawData = true;
      if (type === 'IEND') {
        if (length !== 0 || offset + 12 !== bytes.length) {
          fail(`${path}.data has invalid PNG metadata`);
        }
        sawEnd = true;
        break;
      }
      offset += 12 + length;
    }
    if (!sawData || !sawEnd) fail(`${path}.data is not a complete PNG image`);

    return { data: value, width, height };
  };

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('Video project is required');
  }

  let serializedInput;
  try {
    serializedInput = JSON.stringify(input);
  } catch {
    fail('Video project must be JSON-serializable');
  }
  if (typeof serializedInput !== 'string') {
    fail('Video project must be JSON-serializable');
  }
  if (byteLength(serializedInput) > MAX_JSON_BYTES) {
    fail('Input project JSON must not exceed 24 MB');
  }

  if (input.schema_version !== 1) fail('schema_version must be 1');
  positiveSafeInteger(input.project_version, 'project_version');

  if (!input.report || typeof input.report !== 'object' || Array.isArray(input.report)) {
    fail('report is required');
  }
  const sourceReport = input.report;
  if (sourceReport.schema_version !== 1) fail('report.schema_version must be 1');
  const reportTitle = stringValue(sourceReport.title, 1000, 'report.title', { nonEmpty: true });
  const reportSubtitle = optionalString(sourceReport.subtitle, 200000, 'report.subtitle');
  const reportVersion = sourceReport.version === undefined
    ? 1
    : positiveSafeInteger(sourceReport.version, 'report.version');

  if (!Array.isArray(sourceReport.blocks) || sourceReport.blocks.length > 1000) {
    fail('report.blocks must be an array with at most 1000 entries');
  }
  if (!Array.isArray(sourceReport.sources) || sourceReport.sources.length > 1000) {
    fail('report.sources must be an array with at most 1000 entries');
  }

  const blocks = [];
  for (let index = 0; index < sourceReport.blocks.length; index += 1) {
    const block = sourceReport.blocks[index];
    const path = `report.blocks[${index}]`;
    if (!block || typeof block !== 'object' || Array.isArray(block)) {
      fail(`${path} must be an object`);
    }

    if (block.type === 'heading' || block.type === 'paragraph') {
      const text = stringValue(block.text, 200000, `${path}.text`);
      if (block.type === 'heading') {
        const level = block.level === undefined ? 1 : block.level;
        if (!Number.isSafeInteger(level) || level < 1 || level > 3) {
          fail(`${path}.level must be an integer between 1 and 3`);
        }
        blocks.push({ type: 'heading', text, level });
      } else {
        blocks.push({ type: 'paragraph', text });
      }
      continue;
    }

    if (block.type === 'table') {
      if (!Array.isArray(block.headers) || block.headers.length < 1 || block.headers.length > 12) {
        fail(`${path}.headers must contain between 1 and 12 columns`);
      }
      if (!Array.isArray(block.rows) || block.rows.length > 2000) {
        fail(`${path}.rows must contain at most 2000 rows`);
      }
      const cell = (value, cellPath) => {
        if (typeof value !== 'string' && typeof value !== 'number') {
          fail(`${cellPath} must be a string or number`);
        }
        if (typeof value === 'number' && !Number.isFinite(value)) {
          fail(`${cellPath} must be finite`);
        }
        return stringValue(String(value), 200000, cellPath);
      };
      const headers = block.headers.map((value, column) => cell(value, `${path}.headers[${column}]`));
      const rows = block.rows.map((row, rowIndex) => {
        const rowPath = `${path}.rows[${rowIndex}]`;
        if (!Array.isArray(row) || row.length !== headers.length) {
          fail(`${rowPath} must have ${headers.length} cells`);
        }
        return row.map((value, column) => cell(value, `${rowPath}[${column}]`));
      });
      blocks.push({
        type: 'table',
        title: optionalString(block.title, 200000, `${path}.title`),
        headers,
        rows,
        note: optionalString(block.note, 200000, `${path}.note`)
      });
      continue;
    }

    if (block.type === 'image') {
      const image = pngImage(block.data, `${path}.image`);
      blocks.push({
        type: 'image',
        ...image,
        title: optionalString(block.title, 200000, `${path}.title`),
        note: optionalString(block.note, 200000, `${path}.note`)
      });
      continue;
    }

    fail(`${path}.type is unsupported`);
  }

  const sources = [];
  for (let index = 0; index < sourceReport.sources.length; index += 1) {
    const source = sourceReport.sources[index];
    const path = `report.sources[${index}]`;
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      fail(`${path} must be an object`);
    }
    sources.push({
      title: stringValue(source.title, 90, `${path}.title`, { nonEmpty: true }),
      url: httpUrl(source.url, `${path}.url`),
      publisher: optionalString(source.publisher, 90, `${path}.publisher`),
      date: optionalString(source.date, 40, `${path}.date`)
    });
  }

  const report = {
    schema_version: 1,
    title: reportTitle,
    version: reportVersion,
    subtitle: reportSubtitle,
    blocks,
    sources
  };

  const canvas = input.canvas;
  if (!canvas || typeof canvas !== 'object' || Array.isArray(canvas)) {
    fail('canvas is required');
  }
  const supportedSizes = [
    [640, 360],
    [960, 540],
    [1280, 720],
    [1920, 1080]
  ];
  if (!supportedSizes.some(([width, height]) => canvas.width === width && canvas.height === height)) {
    fail('canvas.width and canvas.height must be a supported landscape 16:9 size');
  }
  if (![12, 24, 30].includes(canvas.fps)) {
    fail('canvas.fps must be 12, 24, or 30');
  }

  if (!Array.isArray(input.shots) || input.shots.length < 1 || input.shots.length > 60) {
    fail('shots must contain between 1 and 60 shots');
  }

  const ids = new Set();
  const shots = [];
  let totalFrames = 0;

  for (let index = 0; index < input.shots.length; index += 1) {
    const shot = input.shots[index];
    const path = `shots[${index}]`;
    if (!shot || typeof shot !== 'object' || Array.isArray(shot)) {
      fail(`${path} must be an object`);
    }

    const kind = shot.kind;
    if (!['title', 'text', 'table', 'image', 'sources'].includes(kind)) {
      fail(`${path}.kind is unsupported`);
    }

    const id = stringValue(shot.id, 120, `${path}.id`, { nonEmpty: true });
    if (ids.has(id)) fail(`${path}.id must be unique`);
    ids.add(id);

    const title = stringValue(shot.title, 90, `${path}.title`);
    const body = stringValue(shot.body, 420, `${path}.body`);
    const caption = stringValue(shot.caption, 420, `${path}.caption`);
    const duration = shot.duration_ms;
    if (!Number.isSafeInteger(duration) || duration < 1000 || duration > 30000) {
      fail(`${path}.duration_ms must be an integer between 1000 and 30000`);
    }
    if (duration * canvas.fps % 1000 !== 0) {
      fail(`${path}.duration_ms must be quantized to an exact frame`);
    }
    totalFrames += duration * canvas.fps / 1000;

    const refs = shot.source_refs === undefined ? [] : shot.source_refs;
    if (!Array.isArray(refs) || refs.length > 3) {
      fail(`${path}.source_refs must be an array with at most 3 entries`);
    }
    for (let refIndex = 0; refIndex < refs.length; refIndex += 1) {
      const ref = refs[refIndex];
      if (!Number.isInteger(ref) || ref < 0 || ref >= sources.length) {
        fail(`${path}.source_refs[${refIndex}] is not a valid report source index`);
      }
    }
    if (kind === 'sources' && refs.length === 0) {
      fail(`${path}.source_refs must contain at least one source for a sources shot`);
    }

    if (kind !== 'table' && Object.prototype.hasOwnProperty.call(shot, 'table')) {
      fail(`${path}.table is not allowed for a ${kind} shot`);
    }
    if (kind !== 'image' && Object.prototype.hasOwnProperty.call(shot, 'image')) {
      fail(`${path}.image is not allowed for a ${kind} shot`);
    }

    const normalized = {
      id,
      kind,
      title,
      body,
      caption,
      duration_ms: duration,
      source_refs: [...refs]
    };

    if (kind === 'table') {
      const table = shot.table;
      if (!table || typeof table !== 'object' || Array.isArray(table)) {
        fail(`${path}.table is required for a table shot`);
      }
      if (!Array.isArray(table.headers) || table.headers.length < 1 || table.headers.length > 4) {
        fail(`${path}.table.headers must contain between 1 and 4 columns`);
      }
      if (!Array.isArray(table.rows) || table.rows.length > 6) {
        fail(`${path}.table.rows must contain at most 6 rows`);
      }
      const cell = (value, cellPath) => stringValue(value, 60, cellPath);
      const headers = table.headers.map((value, column) => cell(value, `${path}.table.headers[${column}]`));
      const rows = table.rows.map((row, rowIndex) => {
        const rowPath = `${path}.table.rows[${rowIndex}]`;
        if (!Array.isArray(row) || row.length !== headers.length) {
          fail(`${rowPath} must have ${headers.length} cells`);
        }
        return row.map((value, column) => cell(value, `${rowPath}[${column}]`));
      });
      normalized.table = {
        headers,
        rows,
        note: optionalString(table.note, 160, `${path}.table.note`)
      };
    }

    if (kind === 'image') {
      const image = shot.image;
      if (!image || typeof image !== 'object' || Array.isArray(image)) {
        fail(`${path}.image is required for an image shot`);
      }
      const parsed = pngImage(image.data, `${path}.image`);
      if (image.width !== parsed.width || image.height !== parsed.height) {
        fail(`${path}.image dimensions do not match the PNG metadata`);
      }
      normalized.image = {
        ...parsed,
        note: optionalString(image.note, 160, `${path}.image.note`)
      };
    }

    shots.push(normalized);
  }

  if (totalFrames > MAX_TOTAL_FRAMES) {
    fail(`Total video frames must not exceed ${MAX_TOTAL_FRAMES}`);
  }

  const normalizedProject = {
    schema_version: 1,
    project_version: input.project_version,
    report,
    canvas: {
      width: canvas.width,
      height: canvas.height,
      fps: canvas.fps
    },
    shots
  };
  const serializedProject = JSON.stringify(normalizedProject);
  if (byteLength(serializedProject) > MAX_JSON_BYTES) {
    fail('Normalized project JSON must not exceed 24 MB');
  }

  return JSON.parse(serializedProject);
}
