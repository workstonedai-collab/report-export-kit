// SPDX-License-Identifier: MIT
// Copyright 2026 workstonedai-collab
import { validateVideoProject } from './schema.js';

export async function createVideoProject(input, options = {}) {
  const { validateDocument } = await import('../index.js');
  const report = validateDocument(input);

  const allowedOptions = ['width', 'height', 'fps', 'shotDurationMs'];
  const unknownOption = Object.keys(options).find((key) => !allowedOptions.includes(key));
  if (unknownOption) throw new Error(`Unknown video option: ${unknownOption}`);

  const width = options.width ?? 1280;
  const height = options.height ?? 720;
  const fps = options.fps ?? 24;
  const shotDurationMs = options.shotDurationMs ?? 6000;

  const supportedSizes = [
    [640, 360],
    [960, 540],
    [1280, 720],
    [1920, 1080]
  ];
  if (!supportedSizes.some(([candidateWidth, candidateHeight]) =>
    width === candidateWidth && height === candidateHeight
  )) {
    throw new Error('Canvas must be a supported landscape 16:9 size');
  }
  if (![12, 24, 30].includes(fps)) {
    throw new Error('Canvas fps must be 12, 24, or 30');
  }
  if (!Number.isSafeInteger(shotDurationMs) || shotDurationMs < 1000 || shotDurationMs > 30000) {
    throw new Error('shotDurationMs must be an integer between 1000 and 30000');
  }
  if (shotDurationMs * fps % 1000 !== 0) {
    throw new Error('shotDurationMs must be quantized to an exact frame');
  }

  const codePointLength = (value) => [...value].length;
  const requireLimit = (value, limit, path) => {
    if (codePointLength(value) > limit) {
      throw new Error(`${path} is ${codePointLength(value)} Unicode code points; the maximum is ${limit}. Shorten the source report.`);
    }
  };

  const splitByCodePoints = (value, limit) => {
    const points = [...value];
    if (points.length <= limit) return [value];
    const chunks = [];
    for (let offset = 0; offset < points.length; offset += limit) {
      chunks.push(points.slice(offset, offset + limit).join(''));
    }
    if (chunks.join('') !== value) {
      throw new Error('Internal paragraph pagination error');
    }
    return chunks;
  };

  const shots = [];
  const add = (kind, title, body, extra = {}) => {
    shots.push({
      id: `shot-${String(shots.length + 1).padStart(4, '0')}`,
      kind,
      title,
      body,
      caption: '',
      duration_ms: shotDurationMs,
      source_refs: [],
      ...extra
    });
  };

  requireLimit(report.title, 90, 'report.title');
  requireLimit(report.subtitle, 420, 'report.subtitle');
  add('title', report.title, report.subtitle);

  for (let blockIndex = 0; blockIndex < report.blocks.length; blockIndex += 1) {
    const block = report.blocks[blockIndex];
    const blockPath = `report.blocks[${blockIndex}]`;

    if (block.type === 'heading') {
      requireLimit(block.text, 90, `${blockPath}.text`);
      add('text', block.text, '');
      continue;
    }

    if (block.type === 'paragraph') {
      const paragraphs = splitByCodePoints(block.text, 420);
      for (const paragraph of paragraphs) {
        add('text', '', paragraph);
      }
      continue;
    }

    if (block.type === 'table') {
      requireLimit(block.title, 90, `${blockPath}.title`);
      requireLimit(block.note, 160, `${blockPath}.note`);
      if (block.headers.length > 4) {
        throw new Error(`${blockPath}.headers has ${block.headers.length} columns; the maximum is 4. Shorten the source report.`);
      }
      for (let column = 0; column < block.headers.length; column += 1) {
        requireLimit(block.headers[column], 60, `${blockPath}.headers[${column}]`);
      }
      for (let rowIndex = 0; rowIndex < block.rows.length; rowIndex += 1) {
        const row = block.rows[rowIndex];
        for (let column = 0; column < row.length; column += 1) {
          requireLimit(row[column], 60, `${blockPath}.rows[${rowIndex}][${column}]`);
        }
      }

      if (block.rows.length === 0) {
        add('table', block.title, '', {
          table: {
            headers: [...block.headers],
            rows: [],
            note: block.note
          }
        });
      } else {
        for (let rowOffset = 0; rowOffset < block.rows.length; rowOffset += 6) {
          add('table', block.title, '', {
            table: {
              headers: [...block.headers],
              rows: block.rows.slice(rowOffset, rowOffset + 6).map((row) => [...row]),
              note: block.note
            }
          });
        }
      }
      continue;
    }

    if (block.type === 'image') {
      requireLimit(block.title, 90, `${blockPath}.title`);
      requireLimit(block.note, 160, `${blockPath}.note`);
      add('image', block.title, '', {
        image: {
          data: block.data,
          width: block.width,
          height: block.height,
          note: block.note
        }
      });
      continue;
    }

    throw new Error(`${blockPath}.type is unsupported`);
  }

  for (let sourceIndex = 0; sourceIndex < report.sources.length; sourceIndex += 3) {
    const refs = report.sources
      .slice(sourceIndex, sourceIndex + 3)
      .map((_, offset) => sourceIndex + offset);
    add('sources', 'Sources', '', { source_refs: refs });
  }

  const project = {
    schema_version: 1,
    project_version: 1,
    report,
    canvas: { width, height, fps },
    shots
  };

  return validateVideoProject(project);
}
