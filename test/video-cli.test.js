import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(root, 'src', 'video', 'cli.js');
const run = (args, cwd = root) => new Promise((resolvePromise) => {
  const child = spawn(process.execPath, [cli, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('close', (code) => resolvePromise({ code, stdout, stderr }));
});

const input = {
  schema_version: 1,
  title: 'CLI 测试',
  subtitle: '',
  blocks: [{ type: 'paragraph', text: '正文' }],
  sources: [{ title: '来源', url: 'https://example.com' }]
};

const createProject = async (source, project) => {
  const result = await run(['create', source, project]);
  assert.equal(result.code, 0, result.stderr);
  return result;
};

test('CLI create saves defaults and preview writes HTML from the project', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'video-cli-'));
  try {
    const source = join(dir, 'input with spaces.json');
    const project = join(dir, 'project with spaces.json');
    const preview = join(dir, 'preview.html');
    await writeFile(source, JSON.stringify(input));
    const creationResult = await createProject(source, project);
    const saved = JSON.parse(await readFile(project, 'utf8'));
    assert.equal(saved.canvas.width, 1280);
    assert.equal(saved.canvas.height, 720);
    assert.equal(saved.canvas.fps, 24);
    assert.equal(JSON.parse(creationResult.stdout).duration_ms, saved.shots.reduce((sum, shot) => sum + shot.duration_ms, 0));
    assert.ok(saved.shots.every((s) => s.duration_ms === 6000));
    assert.ok(saved.shots.length > 0);

    const previewResult = await run(['preview', project, preview]);
    assert.equal(previewResult.code, 0, previewResult.stderr);
    assert.match(await readFile(preview, 'utf8'), /<html/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('CLI create accepts interleaved flags and applies fps and duration', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'video-cli-'));
  try {
    const source = join(dir, 'input.json');
    const project = join(dir, 'project.json');
    await writeFile(source, JSON.stringify(input));
    const result = await run(['create', '--fps', '12', source, project, '--duration', '1.5']);
    assert.equal(result.code, 0, result.stderr);
    const saved = JSON.parse(await readFile(project, 'utf8'));
    assert.equal(saved.canvas.fps, 12);
    assert.equal(JSON.parse(result.stdout).duration_ms, saved.shots.reduce((sum, shot) => sum + shot.duration_ms, 0));
    assert.ok(saved.shots.every((s) => s.duration_ms === 1500));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('CLI create refuses to overwrite output unless --overwrite is supplied', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'video-cli-'));
  try {
    const source = join(dir, 'input.json');
    const project = join(dir, 'project.json');
    await writeFile(source, JSON.stringify(input));
    await writeFile(project, 'sentinel');
    const first = await run(['create', source, project]);
    assert.equal(first.code, 1);
    assert.equal(await readFile(project, 'utf8'), 'sentinel');
    const second = await run(['create', source, project, '--overwrite']);
    assert.equal(second.code, 0, second.stderr);
    assert.notEqual(await readFile(project, 'utf8'), 'sentinel');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('CLI create refuses input and output being the same path even with overwrite', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'video-cli-'));
  try {
    const source = join(dir, 'same.json');
    await writeFile(source, JSON.stringify(input));
    const result = await run(['create', source, source, '--overwrite']);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /paths must differ/i);
    assert.deepEqual(JSON.parse(await readFile(source, 'utf8')), input);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('CLI help succeeds while invalid command and flag invocations fail', async () => {
  const help = await run(['--help']);
  assert.equal(help.code, 0);
  assert.match(help.stdout + help.stderr, /usage|help/i);
  const cases = [
    [],
    ['--unknown'],
    ['create', '--unknown'],
    ['create', '--fps'],
    ['create', 'input.json', 'output.json', '--fps', '24', '--fps', '30'],
    ['preview', '--unknown'],
    ['render', '--unknown'],
    ['render', 'project.json', 'movie.mp4', '--timeout', '600001']
  ];
  for (const args of cases) {
    const result = await run(args);
    assert.equal(result.code, 1, `expected failure for ${args.join(' ')}`);
  }
});

test('CLI render preflight reports missing ffmpeg and creates no partial files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'video-cli-'));
  try {
    const source = join(dir, 'input.json');
    const project = join(dir, 'project.json');
    const output = join(dir, 'movie.mp4');
    await writeFile(source, JSON.stringify(input));
    await createProject(source, project);
    const result = await run(['render', project, output, '--ffmpeg', join(dir, 'missing-ffmpeg'), '--chrome', process.execPath]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /ffmpeg/i);
    await assert.rejects(() => readFile(output));
    await assert.rejects(() => readFile(join(dir, 'movie.srt')));
    await assert.rejects(() => readFile(join(dir, 'movie.vtt')));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('CLI render preflight preserves an existing output when dependencies are unavailable', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'video-cli-'));
  try {
    const source = join(dir, 'input.json');
    const project = join(dir, 'project.json');
    const output = join(dir, 'movie.mp4');
    await writeFile(source, JSON.stringify(input));
    await createProject(source, project);
    await writeFile(output, 'sentinel');
    const result = await run(['render', project, output, '--ffmpeg', join(dir, 'missing-ffmpeg'), '--chrome', process.execPath]);
    assert.equal(result.code, 1);
    assert.equal(await readFile(output, 'utf8'), 'sentinel');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('CLI render preflight preserves an existing sidecar subtitle', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'video-cli-'));
  try {
    const source = join(dir, 'input.json');
    const project = join(dir, 'project.json');
    const output = join(dir, 'movie.mp4');
    const sidecar = join(dir, 'movie.srt');
    await writeFile(source, JSON.stringify(input));
    await createProject(source, project);
    await writeFile(sidecar, 'sentinel');
    const result = await run(['render', project, output, '--ffmpeg', join(dir, 'missing-ffmpeg'), '--chrome', process.execPath]);
    assert.equal(result.code, 1);
    assert.equal(await readFile(sidecar, 'utf8'), 'sentinel');
    await assert.rejects(() => readFile(output));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
