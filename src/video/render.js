// SPDX-License-Identifier: MIT
// Copyright (c) 2026 report-export-kit contributors

import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { access, mkdir, readFile, rename, link, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { validateVideoProject } from './schema.js';
import { generateSubtitles } from './subtitles.js';
import { createPreviewHtml } from './preview.js';

const MAX_INPUT_BYTES = 512 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 512 * 1024 * 1024;
const MAX_PROCESS_OUTPUT_BYTES = 64 * 1024;
const CLEANUP_TIMEOUT_MS = 5000;

function error(message) {
  return new Error(`[video] ${message}`);
}

function validateOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw error('options are required');
  }

  const allowed = new Set(['outputPath', 'chromePath', 'ffmpegPath', 'overwrite', 'timeoutMs']);
  for (const key of Object.keys(options)) {
    if (!allowed.has(key)) throw error(`unknown option: ${key}`);
  }

  const outputPath = options.outputPath;
  if (typeof outputPath !== 'string' || !outputPath) throw error('options.outputPath is required');
  if (!outputPath.toLowerCase().endsWith('.mp4')) throw error('options.outputPath must end in .mp4');
  if (options.chromePath !== undefined && (typeof options.chromePath !== 'string' || !options.chromePath)) {
    throw error('options.chromePath must be a non-empty string');
  }
  if (options.ffmpegPath !== undefined && (typeof options.ffmpegPath !== 'string' || !options.ffmpegPath)) {
    throw error('options.ffmpegPath must be a non-empty string');
  }
  if (options.overwrite !== undefined && typeof options.overwrite !== 'boolean') {
    throw error('options.overwrite must be boolean');
  }
  if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1000 || options.timeoutMs > 600000)) {
    throw error('options.timeoutMs must be an integer between 1000 and 600000');
  }

  return {
    outputPath: path.resolve(outputPath),
    chromePath: options.chromePath,
    ffmpegPath: options.ffmpegPath || 'ffmpeg',
    overwrite: options.overwrite === true,
    timeoutMs: options.timeoutMs ?? 180000,
  };
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function withTimeout(promise, deadline, message) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw error(message);

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(error(message)), remaining);
  });

  try {
    return await Promise.race([Promise.resolve(promise), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function findChrome(explicit, deadline) {
  const candidates = explicit ? [explicit] : [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);

  return withTimeout((async () => {
    for (const candidate of candidates) {
      if (await exists(candidate)) return candidate;
    }
    throw error(`Chrome/Chromium executable was not found${explicit ? `: ${explicit}` : '; set options.chromePath or CHROME_PATH'}`);
  })(), deadline, 'Chrome discovery timed out');
}

function runProcess(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      reject(e);
      return;
    }

    let stdout = '';
    let stderr = '';
    let timer;
    let done = false;

    const finish = (fn, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      fn(value);
    };

    timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      finish(reject, error(`${command} timed out`));
    }, Math.max(1, timeoutMs));

    child.stdout.on('data', data => {
      stdout = (stdout + data.toString()).slice(-MAX_PROCESS_OUTPUT_BYTES);
    });
    child.stderr.on('data', data => {
      stderr = (stderr + data.toString()).slice(-MAX_PROCESS_OUTPUT_BYTES);
    });
    child.on('error', e => finish(reject, e));
    child.on('close', code => finish(resolve, { code, stdout, stderr }));
  });
}

async function checkFfmpeg(ffmpegPath, deadline) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw error('FFmpeg check timed out');

  let result;
  try {
    result = await withTimeout(
      runProcess(ffmpegPath, ['-hide_banner', '-encoders'], Math.min(remaining, 15000)),
      deadline,
      'FFmpeg check timed out',
    );
  } catch (e) {
    throw error(`FFmpeg could not be started (${ffmpegPath}): ${e.message}`);
  }

  if (result.code !== 0) throw error(`FFmpeg is unavailable (${ffmpegPath})`);
  if (!result.stdout.includes('libx264') && !result.stderr.includes('libx264')) {
    throw error('FFmpeg does not provide the libx264 encoder');
  }
}

async function writeFrame(stream, buffer, deadline, encoderExit) {
  if (!stream || stream.destroyed) throw error('FFmpeg input pipe closed unexpectedly');

  const writePromise = new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      stream.removeListener('error', onError);
    };

    const onError = e => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(e);
    };

    stream.once('error', onError);

    try {
      stream.write(buffer, e => {
        if (settled) return;
        settled = true;
        cleanup();
        if (e) reject(e);
        else resolve();
      });
    } catch (e) {
      if (!settled) {
        settled = true;
        cleanup();
        reject(e);
      }
    }
  });

  const encoderFailure = encoderExit.then(result => {
    throw error(result?.error ? `FFmpeg exited: ${result.error.message}` : 'FFmpeg exited before the frame was written');
  });

  await withTimeout(
    Promise.race([writePromise, encoderFailure]),
    deadline,
    'FFmpeg frame write timed out',
  );
}

async function publish(tempPath, outputPath, overwrite) {
  if (overwrite) {
    await rename(tempPath, outputPath);
    return;
  }

  try {
    await link(tempPath, outputPath);
    await unlink(tempPath);
  } catch (e) {
    if (e.code === 'EEXIST') throw error(`output already exists: ${outputPath}`);
    throw e;
  }
}

async function closeBrowser(browser) {
  if (!browser) return;
  try {
    await withTimeout(
      browser.close(),
      Date.now() + CLEANUP_TIMEOUT_MS,
      'browser close timed out',
    );
  } catch {
    try { await browser.close(); } catch {}
  }
}

async function launchBrowser(playwright, chromePath, deadline) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw error('browser launch timed out');

  let launchSettled = false;
  let lateBrowser;
  const launchPromise = playwright.chromium.launch({
    executablePath: chromePath,
    headless: true,
    timeout: remaining,
    args: ['--disable-background-networking', '--disable-component-update', '--disable-sync'],
  });

  launchPromise.then(browser => {
    if (!launchSettled) lateBrowser = browser;
  }).catch(() => {});

  try {
    const browser = await withTimeout(launchPromise, deadline, 'browser launch timed out');
    launchSettled = true;
    return browser;
  } catch (e) {
    launchSettled = true;
    if (lateBrowser) await closeBrowser(lateBrowser);
    throw e;
  }
}

export async function renderVideo(project, options = {}) {
  const opts = validateOptions(options);
  const deadline = Date.now() + opts.timeoutMs;
  const validated = validateVideoProject(project);
  const shots = validated.shots;
  const canvas = validated.canvas;
  const fps = canvas.fps;
  const durationMs = shots.reduce((sum, shot) => sum + shot.duration_ms, 0);
  const frames = Math.ceil(durationMs * fps / 1000);

  if (!Number.isInteger(frames) || frames <= 0) {
    throw error('validated project has no renderable frames');
  }

  let target;
  try {
    target = await withTimeout(stat(opts.outputPath), deadline, 'output check timed out');
  } catch (e) {
    if (e.message !== '[video] output check timed out' && e.code !== 'ENOENT') throw e;
    target = null;
  }

  if (target?.isDirectory()) throw error(`output path is a directory: ${opts.outputPath}`);
  if (target && !opts.overwrite) throw error(`output already exists: ${opts.outputPath}`);

  const subtitles = generateSubtitles(validated);
  const html = await withTimeout(
    Promise.resolve(createPreviewHtml(validated, { editor: false })),
    deadline,
    'preview creation timed out',
  );

  const chromePath = await findChrome(opts.chromePath, deadline);
  await checkFfmpeg(opts.ffmpegPath, deadline);

  const parent = path.dirname(opts.outputPath);
  await withTimeout(mkdir(parent, { recursive: true }), deadline, 'output directory creation timed out');

  const tempPath = path.join(parent, `.${path.basename(opts.outputPath)}.${randomUUID()}.tmp.mp4`);
  let browser;
  let context;
  let page;
  let encoder;
  let encoderClosed = false;
  let stderr = '';
  let inputBytes = 0;
  let encoderError = null;
  let createdTemp = false;
  let encoderExit;

  try {
    let playwright;
    try {
      playwright = await import('playwright-core');
    } catch (e) {
      throw error(`playwright-core is required for rendering but could not be imported: ${e.message}`);
    }

    browser = await launchBrowser(playwright, chromePath, deadline);
    context = await withTimeout(browser.newContext({
      viewport: { width: canvas.width, height: canvas.height },
      deviceScaleFactor: 1,
      serviceWorkers: 'block',
      javaScriptEnabled: true,
    }), deadline, 'browser context creation timed out');

    await withTimeout(context.route('**/*', route => {
      const url = route.request().url();
      const action = url.startsWith('data:') || url.startsWith('about:')
        ? route.continue()
        : route.abort();
      if (action && typeof action.catch === 'function') action.catch(() => {});
    }), deadline, 'browser route setup timed out');

    page = await withTimeout(context.newPage(), deadline, 'browser page creation timed out');
    await withTimeout(page.setContent(html, { waitUntil: 'load' }), deadline, 'preview setup timed out');

    try {
      encoder = spawn(opts.ffmpegPath, [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'image2pipe', '-vcodec', 'mjpeg', '-r', String(fps), '-i', 'pipe:0',
        '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(fps),
        '-movflags', '+faststart', '-metadata', 'title=Report video', tempPath,
      ], { stdio: ['pipe', 'ignore', 'pipe'] });
    } catch (e) {
      throw error(`FFmpeg could not be started (${opts.ffmpegPath}): ${e.message}`);
    }

    createdTemp = true;
    encoder.stdin.on('error', () => {});
    encoder.stderr.on('data', data => {
      stderr = (stderr + data.toString()).slice(-MAX_PROCESS_OUTPUT_BYTES);
    });

    encoderExit = new Promise(resolve => {
      let settled = false;
      const finish = result => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      encoder.on('error', e => {
        encoderError = e;
        finish({ code: null, signal: null, error: e });
      });
      encoder.on('close', (code, signal) => {
        encoderClosed = true;
        finish({ code, signal });
      });
    });

    await withTimeout(page.evaluate(async ({ timeMs }) => {
      await window.reportVideo.ready;
      return window.reportVideo.frame(timeMs);
    }, { timeMs: 0 }), deadline, 'preview initialization timed out');

    for (let i = 0; i < frames; i += 1) {
      if (encoderError) throw encoderError;
      const timeMs = i * 1000 / fps;

      await withTimeout(page.evaluate(async ({ timeMs }) => {
        await window.reportVideo.ready;
        return window.reportVideo.frame(timeMs);
      }, { timeMs }), deadline, 'frame rendering timed out');

      const image = await withTimeout(page.screenshot({ type: 'jpeg', animations: 'disabled' }), deadline, 'screenshot timed out');
      inputBytes += image.length;
      if (inputBytes > MAX_INPUT_BYTES) throw error('encoded input exceeds the 512 MB limit');

      await writeFrame(encoder.stdin, image, deadline, encoderExit);
    }

    encoder.stdin.end();
    const exit = await withTimeout(encoderExit, deadline, 'FFmpeg encoding timed out');
    if (exit.error) throw exit.error;
    if (exit.code !== 0) throw error(`FFmpeg failed${stderr ? `: ${stderr.trim()}` : ''}`);

    const outputStat = await withTimeout(stat(tempPath), deadline, 'output verification timed out');
    if (outputStat.size <= 0) throw error('FFmpeg produced an empty output');
    if (outputStat.size > MAX_OUTPUT_BYTES) throw error('output exceeds the 512 MB limit');

    const hash = createHash('sha256');
    hash.update(await withTimeout(readFile(tempPath), deadline, 'output hash timed out'));
    const sha256 = hash.digest('hex');

    await publish(tempPath, opts.outputPath, opts.overwrite);
    createdTemp = false;

    return {
      path: opts.outputPath,
      bytes: outputStat.size,
      sha256,
      duration_ms: durationMs,
      frames,
      srt: subtitles.srt,
      vtt: subtitles.vtt,
    };
  } finally {
    if (encoder && !encoderClosed) {
      try { encoder.stdin.destroy(); } catch {}
      try { encoder.kill('SIGKILL'); } catch {}
      try {
        await withTimeout(
          encoderExit || Promise.resolve(),
          Date.now() + CLEANUP_TIMEOUT_MS,
          'FFmpeg cleanup timed out',
        );
      } catch {}
    }

    if (page) {
      try {
        await withTimeout(page.close(), Date.now() + CLEANUP_TIMEOUT_MS, 'page cleanup timed out');
      } catch {}
    }
    if (context) {
      try {
        await withTimeout(context.close(), Date.now() + CLEANUP_TIMEOUT_MS, 'context cleanup timed out');
      } catch {}
    }
    if (browser) await closeBrowser(browser);
    if (createdTemp) {
      try { await unlink(tempPath); } catch {}
    }
  }
}

export default renderVideo;
