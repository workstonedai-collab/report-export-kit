import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  createVideoProject,
  createPreviewHtml,
  validateVideoProject,
  saveVideoProject,
  loadVideoProject,
  renderVideo,
  generateSubtitles,
  timeline
} from '../src/video/index.js';
import { barChart } from '../src/charts.js';

const CHROME = process.env.REPORT_VIDEO_TEST_CHROME;
const FFMPEG = process.env.REPORT_VIDEO_TEST_FFMPEG;

async function launchBrowser() {
  const { chromium } = await import('playwright-core');
  return chromium.launch({
    headless: true,
    executablePath: CHROME
  });
}

function runProcess(command, args, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let settled = false;

    const append = (current, chunk) =>
      Buffer.concat([current, chunk]).subarray(-65536);

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error(`${path.basename(command)} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', chunk => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on('data', chunk => {
      stderr = append(stderr, chunk);
    });
    child.on('error', error => finish(error));
    child.on('close', code => {
      if (code === 0) finish(null, { stdout, stderr });
      else {
        finish(new Error(
          `${path.basename(command)} exited with ${code}: ${stderr.toString('utf8')}`
        ));
      }
    });
  });
}

function pngSize(buffer) {
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG');
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function paragraphReport(text = 'Short paragraph body.') {
  return {
    title: "synthetic's report",
    version: 1,
    subtitle: 'Synthetic subtitle',
    blocks: [{ type: 'paragraph', text }],
    sources: []
  };
}

test('offline file preview preserves every shot kind and rejects overflow', {
  skip: !CHROME,
  timeout: 180000
}, async () => {
  const hostile = "中文😀</script><img src=x onerror=globalThis.PWNED=1>" +
    String.raw`\u003c`;
  const report = {
    title: "synthetic's report",
    version: 1,
    subtitle: 'Synthetic subtitle',
    blocks: [
      { type: 'paragraph', text: hostile },
      {
        type: 'table',
        title: 'Synthetic table',
        headers: ['Name', 'Value'],
        rows: [['Alpha', '12']],
        note: 'Table note'
      },
      {
        type: 'image',
        title: 'Synthetic chart',
        data: barChart([12, 18]).toString('base64'),
        note: 'Image note'
      }
    ],
    sources: [{
      title: 'Synthetic source',
      url: 'https://example.invalid/source',
      publisher: 'Example',
      date: '2026-01-01'
    }]
  };
  const project = await createVideoProject(report, {
    width: 640,
    height: 360,
    fps: 12,
    shotDurationMs: 1000
  });
  const html = createPreviewHtml(project, { editor: false });
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'report-video-preview-'));
  let browser;
  try {
    const htmlPath = path.join(tempDir, 'preview.html');
    await fs.writeFile(htmlPath, html, 'utf8');
    browser = await launchBrowser();
    const context = await browser.newContext({ viewport: { width: 640, height: 360 } });
    const page = await context.newPage();
    const requests = [];
    page.on('request', request => requests.push(request.url()));

    await page.goto(pathToFileURL(htmlPath).href);
    await page.evaluate(() => reportVideo.ready);
    assert.equal(await page.locator('#editor').count(), 0);

    let start = 0;
    for (const shot of project.shots) {
      const frame = await page.evaluate(ms => reportVideo.frame(ms), start);
      assert.equal(frame.shotId, shot.id);
      const stageText = await page.locator('#stage').innerText();
      if (shot.kind === 'title') assert.ok(stageText.includes(shot.body));
      if (shot.kind === 'text') assert.ok(stageText.includes(shot.body));
      if (shot.kind === 'table') {
        assert.ok(stageText.includes(shot.table.headers[0]));
        assert.ok(stageText.includes(shot.table.note));
      }
      if (shot.kind === 'image') {
        assert.ok(stageText.includes(shot.image.note));
        assert.ok(await page.locator('#stage img').evaluate(image => image.naturalWidth > 0));
      }
      if (shot.kind === 'sources') {
        assert.ok(stageText.includes(report.sources[0].url));
      }
      start += shot.duration_ms;
    }

    const paragraphShot = project.shots.find(shot => shot.kind === 'text');
    const paragraphStart = project.shots
      .slice(0, project.shots.indexOf(paragraphShot))
      .reduce((sum, shot) => sum + shot.duration_ms, 0);
    await page.evaluate(ms => reportVideo.frame(ms), paragraphStart);
    assert.equal(await page.locator('#stage .body').textContent(), paragraphShot.body);
    assert.equal(await page.evaluate(() => globalThis.PWNED), undefined);
    assert.deepEqual(
      requests.filter(url => /^https?:/i.test(url)),
      []
    );

    const dimensions = await page.evaluate(() => ({
      width: document.body.scrollWidth,
      height: document.body.scrollHeight
    }));
    assert.deepEqual(dimensions, { width: 640, height: 360 });
    const screenshot = await page.screenshot({ type: 'png' });
    assert.deepEqual(pngSize(screenshot), { width: 640, height: 360 });

    const oldProject = await page.evaluate(() => reportVideo.getProject());
    const candidate = structuredClone(oldProject);
    candidate.shots[0].body = 'x\n'.repeat(180);
    await assert.rejects(
      page.evaluate(value => reportVideo.setProject(value), candidate),
      /布局溢出|overflow/
    );
    assert.deepEqual(
      await page.evaluate(() => reportVideo.getProject()),
      oldProject
    );
    await page.evaluate(() => reportVideo.frame(0));
    assert.equal(
      await page.locator('#stage .body').textContent(),
      oldProject.shots[0].body
    );
  } finally {
    if (browser) await browser.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('editor round-trip downloads, reloads, and rejects invalid edits', {
  skip: !CHROME,
  timeout: 180000
}, async () => {
  const report = paragraphReport('Original paragraph body.');
  const originalReport = structuredClone(report);
  const project = await createVideoProject(report, {
    width: 640,
    height: 360,
    fps: 12,
    shotDurationMs: 1000
  });
  assert.equal(project.shots[1].kind, 'text');
  const html = createPreviewHtml(project, { editor: true });
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'report-video-editor-'));
  let browser;
  try {
    const htmlPath = path.join(tempDir, 'editor.html');
    await fs.writeFile(htmlPath, html, 'utf8');
    browser = await launchBrowser();
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true
    });
    const page = await context.newPage();
    await page.goto(pathToFileURL(htmlPath).href);
    await page.evaluate(() => reportVideo.ready);

    const stageFits = () => {
      const stage = document.getElementById('stage');
      const stagebox = document.getElementById('stagebox');
      if (!stage || !stagebox) return false;
      const stageRect = stage.getBoundingClientRect();
      const boxRect = stagebox.getBoundingClientRect();
      return stageRect.width > 0 && stageRect.height > 0 &&
        Math.abs(stageRect.width - boxRect.width) <= 1 &&
        Math.abs(stageRect.height - boxRect.height) <= 1 &&
        stageRect.left >= boxRect.left - 1 &&
        stageRect.top >= boxRect.top - 1 &&
        stageRect.right <= boxRect.right + 1 &&
        stageRect.bottom <= boxRect.bottom + 1;
    };
    await page.waitForFunction(stageFits);
    const desktopFit = await page.evaluate(() => {
      const stage = document.getElementById('stage').getBoundingClientRect();
      const stagebox = document.getElementById('stagebox').getBoundingClientRect();
      return {
        stageWidth: stage.width,
        stageHeight: stage.height,
        boxWidth: stagebox.width,
        boxHeight: stagebox.height,
        fits: stage.left >= stagebox.left - 1 &&
          stage.top >= stagebox.top - 1 &&
          stage.right <= stagebox.right + 1 &&
          stage.bottom <= stagebox.bottom + 1
      };
    });
    assert.ok(Math.abs(desktopFit.stageWidth - desktopFit.boxWidth) <= 1);
    assert.ok(Math.abs(desktopFit.stageHeight - desktopFit.boxHeight) <= 1);
    assert.ok(desktopFit.fits);

    await page.setViewportSize({ width: 375, height: 900 });
    await page.waitForFunction(stageFits);
    assert.ok(
      await page.evaluate(() => document.body.scrollWidth <= window.innerWidth),
      'editor preview must not overflow horizontally at a narrow viewport'
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.waitForFunction(stageFits);

    await page.locator('#shots button').nth(1).click();
    await page.locator('#etitle').fill('Edited shot');
    await page.locator('#ebody').fill('修改后的正文。');
    await page.locator('#ecaption').fill('Edited caption');
    await page.locator('#eduration').fill('2.5');
    await page.locator('#apply').click();
    await page.waitForFunction(() =>
      reportVideo.getProject().shots[1].body === '修改后的正文。'
    );

    const downloadedPath = path.join(tempDir, 'edited.json');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#save').click()
    ]);
    await download.saveAs(downloadedPath);

    const saved = JSON.parse(await fs.readFile(downloadedPath, 'utf8'));
    const canonical = validateVideoProject(saved);
    assert.equal(canonical.shots[1].caption, 'Edited caption');
    assert.equal(canonical.shots[1].duration_ms, 2500);
    const subtitles = generateSubtitles(canonical);
    assert.match(subtitles.srt, /Edited caption/);
    assert.match(subtitles.srt, /00:00:03,500/);
    assert.ok(timeline(canonical));

    const reopened = await context.newPage();
    await reopened.goto(pathToFileURL(htmlPath).href);
    await reopened.evaluate(() => reportVideo.ready);
    await reopened.locator('#file').setInputFiles(downloadedPath);
    await reopened.waitForFunction(() =>
      document.getElementById('status').textContent.includes('项目已加载')
    );
    assert.deepEqual(
      await reopened.evaluate(() => reportVideo.getProject()),
      canonical
    );
    const frame = await reopened.evaluate(() => reportVideo.frame(1000));
    assert.equal(frame.shotId, canonical.shots[1].id);
    const stageText = await reopened.locator('#stage').innerText();
    assert.ok(stageText.includes('Edited shot'));
    assert.ok(stageText.includes('修改后的正文。'));
    assert.ok(stageText.includes('Edited caption'));

    const validState = await reopened.evaluate(() => reportVideo.getProject());
    await reopened.locator('#etitle').fill('x'.repeat(91));
    await reopened.locator('#apply').click();
    await reopened.waitForFunction(() =>
      document.getElementById('status').classList.contains('error')
    );
    assert.deepEqual(
      await reopened.evaluate(() => reportVideo.getProject()),
      validState
    );

    const nodePath = path.join(tempDir, 'node-project.json');
    await saveVideoProject(canonical, nodePath);
    const loaded = await loadVideoProject(nodePath);
    assert.deepEqual(loaded, canonical);
    assert.deepEqual(report, originalReport);
  } finally {
    if (browser) await browser.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('real MP4 rendering produces timed video frames and subtitles', {
  skip: !CHROME || !FFMPEG,
  timeout: 300000
}, async () => {
  const project = await createVideoProject(paragraphReport('MP4 paragraph body.'), {
    width: 640,
    height: 360,
    fps: 12,
    shotDurationMs: 1000
  });
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'report-video-render-'));
  try {
    const outputPath = path.join(tempDir, 'initial.mp4');
    const result = await renderVideo(project, {
      outputPath,
      chromePath: CHROME,
      ffmpegPath: FFMPEG,
      timeoutMs: 180000
    });
    assert.equal(result.frames, 24);
    assert.equal(result.duration_ms, 2000);
    assert.ok(result.bytes > 1000);
    assert.match(result.sha256, /^[a-f0-9]{64}$/);

    const bytes = await fs.readFile(outputPath);
    assert.equal(bytes.subarray(4, 8).toString('ascii'), 'ftyp');
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      result.sha256
    );

    const decoded = await runProcess(FFMPEG, [
      '-hide_banner', '-i', outputPath, '-f', 'null', '-'
    ]);
    const decodedText = decoded.stderr.toString('utf8');
    assert.match(decodedText, /Video:\s*h264/);
    assert.match(decodedText, /640x360/);
    assert.match(decodedText, /Duration:\s*00:00:02\.00/);
    assert.doesNotMatch(decodedText, /Audio:/);

    const earlyPng = path.join(tempDir, 'early.png');
    const latePng = path.join(tempDir, 'late.png');
    await runProcess(FFMPEG, [
      '-hide_banner', '-y', '-ss', '0.2', '-i', outputPath,
      '-frames:v', '1', earlyPng
    ]);
    await runProcess(FFMPEG, [
      '-hide_banner', '-y', '-ss', '1.2', '-i', outputPath,
      '-frames:v', '1', latePng
    ]);
    const [earlyBytes, lateBytes] = await Promise.all([
      fs.readFile(earlyPng),
      fs.readFile(latePng)
    ]);
    assert.notDeepEqual(earlyBytes, lateBytes);

    const edited = structuredClone(project);
    edited.shots[1].body = 'Edited MP4 body.';
    edited.shots[1].caption = 'Edited MP4 caption';
    edited.shots[1].duration_ms = 2500;
    const editedPath = path.join(tempDir, 'edited.mp4');
    const editedResult = await renderVideo(edited, {
      outputPath: editedPath,
      chromePath: CHROME,
      ffmpegPath: FFMPEG,
      timeoutMs: 180000
    });
    assert.equal(editedResult.frames, 42);
    assert.equal(editedResult.duration_ms, 3500);
    assert.match(editedResult.srt, /Edited MP4 caption/);
    assert.match(editedResult.srt, /00:00:03,500/);

    const editedDecode = await runProcess(FFMPEG, [
      '-hide_banner', '-i', editedPath, '-f', 'null', '-'
    ]);
    assert.match(
      editedDecode.stderr.toString('utf8'),
      /Duration:\s*00:00:03\.50/
    );
    const leftovers = (await fs.readdir(tempDir))
      .filter(name => name.endsWith('.tmp.mp4'));
    assert.deepEqual(leftovers, []);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
