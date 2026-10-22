import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TextEncoder } from 'node:util';
import vm from 'node:vm';
import * as rootApi from '../src/index.js';
import * as videoApi from '../src/video/index.js';
import { createVideoProject, validateVideoProject, generateSubtitles, timeline, saveVideoProject, loadVideoProject, createPreviewHtml } from '../src/video/index.js';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const report = {
  schema_version: 1,
  title: '测试报告',
  subtitle: '副标题',
  version: 3,
  blocks: [
    { type: 'heading', text: '章节', level: 1 },
    { type: 'paragraph', text: '原始段落。' },
    { type: 'table', title: '表格', headers: ['名称', '数值'], rows: [['一', '1'], ['二', '2']], note: '注释' },
    { type: 'image', data: png, width: 1, height: 1, title: '图片', note: '图片说明' }
  ],
  sources: [{ title: '来源', url: 'https://example.com/source', publisher: '', date: '' }]
};
const normalizedReport = report;
const base = { schema_version: 1, project_version: 1, report, canvas: { width: 1280, height: 720, fps: 24 }, shots: [] };
const project = (overrides = {}) => ({
  ...base,
  ...overrides,
  report: { ...base.report, ...(overrides.report || {}) },
  shots: overrides.shots || [{ id: 'one', kind: 'text', title: '标题', body: '正文', caption: '', duration_ms: 1000, source_refs: [] }]
});

test('validateVideoProject is deterministic and preserves the complete normalized report', () => {
  const input = project();
  const first = validateVideoProject(input);
  const second = validateVideoProject(input);
  assert.deepEqual(first, second);
  assert.deepEqual(first.report, normalizedReport);
  assert.deepEqual(first.report.sources, input.report.sources);
  assert.equal(first.report.version, 3);
  assert.deepEqual(first.report.blocks, input.report.blocks);
  assert.equal(first.canvas.width, 1280);
  assert.equal(first.canvas.fps, 24);
});

test('validateVideoProject does not mutate its input', () => {
  const input = project();
  const before = JSON.stringify(input);
  validateVideoProject(input);
  assert.equal(JSON.stringify(input), before);
});

test('root API exposes the same video functions as the video entry point', () => {
  const functions = Object.entries(videoApi).filter(([, value]) => typeof value === 'function');
  assert.ok(functions.length > 0);
  for (const [name, value] of functions) {
    assert.equal(rootApi[name], value, name);
  }
});

test('builder retains report sources, PNG bytes, tables and paginates more than six rows', async () => {
  const newRows = Array.from({ length: 7 }, (_, index) => [`行${index}`]);
  const input = {
    ...report,
    blocks: [...report.blocks, { type: 'table', title: '分页', headers: ['列'], rows: newRows }]
  };
  const result = await createVideoProject(input, { shotDurationMs: 1000 });
  assert.equal(result.report.sources[0].url, 'https://example.com/source');
  assert.equal(result.report.blocks.find((block) => block.type === 'image').data, png);
  const originalTable = result.shots.find((shot) => shot.kind === 'table' && shot.title === '表格');
  const pagedTables = result.shots.filter((shot) => shot.kind === 'table' && shot.title === '分页');
  assert.ok(originalTable);
  assert.deepEqual(originalTable.table.rows, [['一', '1'], ['二', '2']]);
  assert.deepEqual(pagedTables.map((shot) => shot.table.rows.length), [6, 1]);
  assert.deepEqual(pagedTables.flatMap((shot) => shot.table.rows), newRows);
  assert.deepEqual(pagedTables[0].table.headers, ['列']);
});

test('builder splits a long Unicode paragraph without losing characters or surrogate pairs', async () => {
  const text = `${'😀'.repeat(250)}${'字'.repeat(600)}尾巴`;
  assert.ok([...text].length > 840);
  const result = await createVideoProject({ ...report, blocks: [{ type: 'paragraph', text }] }, { shotDurationMs: 1000 });
  const textShots = result.shots.filter((shot) => shot.kind === 'text');
  const joined = textShots.map((shot) => shot.body).join('');
  assert.equal(textShots.length, 3);
  assert.equal(joined, text);
  assert.ok(textShots.every((shot) => [...shot.body].length <= 420));
});

test('builder creates an empty table shot and does not invent source references', async () => {
  const result = await createVideoProject({ ...report, blocks: [{ type: 'table', headers: ['列'], rows: [] }] }, { shotDurationMs: 1000 });
  const table = result.shots.find((shot) => shot.kind === 'table');
  assert.ok(table);
  assert.deepEqual(table.table.rows, []);
  assert.ok(result.shots.filter((shot) => shot.kind !== 'sources').every((shot) => shot.source_refs.length === 0));
});

test('builder rejects overlong title, table cell and note with path-specific errors', async () => {
  await assert.rejects(() => createVideoProject({ ...report, title: 'x'.repeat(91) }), /report\.title/);
  await assert.rejects(() => createVideoProject({ ...report, blocks: [{ type: 'table', headers: ['x'.repeat(61)], rows: [] }] }), /headers\[0\]/);
  await assert.rejects(() => createVideoProject({ ...report, blocks: [{ type: 'table', headers: ['x'], rows: [], note: 'x'.repeat(161) }] }), /note/);
});

test('validateVideoProject rejects malformed schema values and invalid PNG metadata', () => {
  assert.throws(() => validateVideoProject(project({ schema_version: undefined })), /schema_version/);
  assert.throws(() => validateVideoProject(project({ shots: [{ ...project().shots[0], id: 'one' }, { ...project().shots[0], id: 'one' }] })), /unique/);
  assert.throws(() => validateVideoProject(project({ shots: [{ ...project().shots[0], kind: 'image', image: { data: png, width: 2, height: 1 } }] })), /dimensions/);
  assert.throws(() => validateVideoProject(project({ shots: [{ ...project().shots[0], kind: 'image', image: { data: 'not-png', width: 1, height: 1 } }] })), /PNG/);
});

test('validateVideoProject enforces source URL, canvas, duration and frame limits', () => {
  assert.throws(() => validateVideoProject(project({ report: { ...report, sources: [{ title: 'x', url: 'file:///tmp/x' }] } })), /HTTP/);
  assert.throws(() => validateVideoProject(project({ canvas: { width: 1280, height: 720, fps: 25 } })), /fps/);
  assert.throws(() => validateVideoProject(project({ shots: [{ ...project().shots[0], duration_ms: 1001 }] })), /quantized/);
  assert.throws(() => validateVideoProject(project({ shots: Array.from({ length: 60 }, (_, index) => ({ ...project().shots[0], id: String(index), duration_ms: 30000 })) })), /frames/);
});

test('generateSubtitles skips empty captions, preserves literal markup and uses exact shot boundaries', () => {
  const p = project({ shots: [
    { id: 'a', kind: 'text', title: '', body: '', caption: '  ', duration_ms: 1000, source_refs: [] },
    { id: 'b', kind: 'text', title: '', body: '', caption: 'A & <B>\n\nC', duration_ms: 2000, source_refs: [] }
  ] });
  const result = generateSubtitles(p);
  assert.equal(result.duration_ms, 3000);
  assert.match(result.srt, /00:00:01,000 --> 00:00:03,000/);
  assert.match(result.srt, /A &amp; &lt;B&gt;/);
  assert.doesNotMatch(result.srt, /WEBVTT/);
  assert.match(result.vtt, /WEBVTT/);
  assert.match(result.vtt, /00:00:01\.000 --> 00:00:03\.000/);
});

test('timeline returns contiguous exact boundaries for every shot', () => {
  const p = project({ shots: [
    { id: 'a', kind: 'text', title: '', body: '', caption: '', duration_ms: 1000, source_refs: [] },
    { id: 'b', kind: 'text', title: '', body: '', caption: '', duration_ms: 1500, source_refs: [] }
  ] });
  assert.deepEqual(timeline(p), [{ id: 'a', start_ms: 0, end_ms: 1000 }, { id: 'b', start_ms: 1000, end_ms: 2500 }]);
});

test('save and load round-trip an edited project and leave the original report untouched', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'video-project-'));
  const path = join(dir, 'project.json');
  try {
    const original = project();
    const originalReport = JSON.stringify(original.report);
    await saveVideoProject(original, path);
    const edited = { ...original, shots: [{ ...original.shots[0], caption: 'changed', duration_ms: 2000 }] };
    await saveVideoProject(edited, path, { overwrite: true });
    const loaded = await loadVideoProject(path);
    assert.equal(loaded.shots[0].caption, 'changed');
    assert.equal(loaded.shots[0].duration_ms, 2000);
    assert.deepEqual(loaded.report, normalizedReport);
    assert.equal(JSON.stringify(original.report), originalReport);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('save refuses an existing file by default and overwrite changes it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'video-project-'));
  const path = join(dir, 'project.json');
  try {
    await writeFile(path, 'sentinel');
    await assert.rejects(() => saveVideoProject(project(), path), /exists|overwrite/i);
    assert.equal(await readFile(path, 'utf8'), 'sentinel');
    await saveVideoProject(project(), path, { overwrite: true });
    assert.notEqual(await readFile(path, 'utf8'), 'sentinel');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('load rejects invalid JSON and projects with an unsupported version', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'video-project-'));
  const bad = join(dir, 'bad.json');
  const version = join(dir, 'version.json');
  try {
    await writeFile(bad, '{not json');
    await assert.rejects(() => loadVideoProject(bad), /JSON|parse/i);
    await writeFile(version, JSON.stringify(project({ schema_version: 2 })));
    await assert.rejects(() => loadVideoProject(version), /schema_version/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('preview HTML is synchronous, contains editor mode and embeds a CJK-capable font', () => {
  const html = createPreviewHtml(project(), { editor: true });
  assert.match(html, /<html/i);
  assert.match(html, /editor/i);
  assert.match(html, /@font-face/i);
  assert.match(html, /Noto|font/i);
});

test('preview preserves hostile and literal text without injecting HTML', async () => {
  const hostile = '</script><img src=x onerror=globalThis.__videoInjected=true>';
  const literalUnicode = String.raw`\u0061`;
  const result = await createVideoProject({
    ...report,
    blocks: [{ type: 'paragraph', text: `${hostile}${literalUnicode}` }]
  }, { shotDurationMs: 1000 });
  assert.ok(result.shots.some((shot) => shot.body.includes(hostile)));
  assert.ok(result.shots.some((shot) => shot.body.includes(literalUnicode)));

  const html = createPreviewHtml(result);
  assert.doesNotMatch(html, /<img\s+src=x\s+onerror=/i);
  assert.ok(html.includes(literalUnicode));
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
    assert.doesNotThrow(() => new vm.Script(match[1]), 'inline preview script must compile');
  }
});

test('standalone validator is self-contained and executable with browser globals', () => {
  const source = validateVideoProject.toString();
  const sandbox = { atob: globalThis.atob, TextEncoder, URL };
  const validator = vm.runInNewContext(`(${source})`, vm.createContext(sandbox));
  const input = project();
  assert.deepEqual(
    JSON.parse(JSON.stringify(validator(input))),
    JSON.parse(JSON.stringify(validateVideoProject(input)))
  );
});
