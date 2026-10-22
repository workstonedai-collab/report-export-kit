#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright 2026 workstonedai-collab
import { readFile, stat } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { createVideoProject, generateSubtitles, createPreviewHtml, loadVideoProject, renderVideo } from "./index.js";
import { checkOutputPath, saveVideoProject, writeAtomic } from "./files.js";

const MAX_BYTES = 24 * 1024 * 1024;
const usage = `Usage:
  report-video create <input-report.json> <output-project.json> [--width 1280] [--height 720] [--fps 24] [--duration 6] [--overwrite]
  report-video preview <project.json> <output.html> [--overwrite]
  report-video render <project.json> <output.mp4> [--chrome PATH] [--ffmpeg PATH] [--timeout 180000] [--overwrite]
`;
const fail = (message) => { throw new Error(message); };
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const integer = (value, name, min, max) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    fail(`${name} must be an integer from ${min} to ${max}`);
  }
  return number;
};

function parseFlags(args, allowed) {
  const positionals = [];
  const flags = {};
  const valueFlags = new Set(["width", "height", "fps", "duration", "chrome", "ffmpeg", "timeout"]);

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) {
      positionals.push(argument);
      continue;
    }
    const name = argument.slice(2);
    if (!allowed.includes(name)) fail(`Unknown flag: --${name}`);
    if (has(flags, name)) fail(`Duplicate flag: --${name}`);
    if (name === "overwrite") {
      flags[name] = true;
      continue;
    }
    if (!valueFlags.has(name)) fail(`Unknown flag: --${name}`);
    if (index + 1 >= args.length || args[index + 1].startsWith("--")) {
      fail(`Missing value for --${name}`);
    }
    flags[name] = args[index + 1];
    index += 1;
  }
  return { positionals, flags };
}

async function readBoundedJson(path) {
  const absolute = resolve(path);
  const info = await stat(absolute);
  if (!info.isFile()) fail(`Input is not a regular file: ${absolute}`);
  if (info.size > MAX_BYTES) fail("Input exceeds the 24 MB limit");
  const content = await readFile(absolute);
  if (content.length > MAX_BYTES) fail("Input exceeds the 24 MB limit");
  try {
    return JSON.parse(content.toString("utf8"));
  } catch {
    fail("Input is not valid JSON");
  }
}

function requirePaths(positionals, message) {
  if (positionals.length !== 2) fail(message);
  return positionals;
}

function assertDifferent(paths, message) {
  const unique = new Set(paths.map((path) => resolve(path)));
  if (unique.size !== paths.length) fail(message);
}

async function main(argv) {
  const command = argv[0];
  if (command === "--help" || command === "-h") {
    process.stdout.write(usage);
    return 0;
  }
  if (!command) {
    process.stderr.write(usage);
    fail("A command is required");
  }
  if (!["create", "preview", "render"].includes(command)) fail(`Unknown command: ${command}`);

  const args = argv.slice(1);
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(usage);
    return 0;
  }

  if (command === "create") {
    const { positionals, flags } = parseFlags(args, ["width", "height", "fps", "duration", "overwrite"]);
    const [inputPath, outputPath] = requirePaths(positionals, "create requires an input report and an output project");
    assertDifferent([inputPath, outputPath], "Input and output paths must differ");
    if (extname(outputPath).toLowerCase() !== ".json") fail("Output project must use the .json extension");
    const width = integer(flags.width ?? "1280", "--width", 1, 7680);
    const height = integer(flags.height ?? "720", "--height", 1, 4320);
    const fps = integer(flags.fps ?? "24", "--fps", 1, 120);
    const seconds = Number(flags.duration ?? "6");
    if (!Number.isFinite(seconds) || seconds <= 0) fail("--duration must be a positive number of seconds");
    const durationMs = seconds * 1000;
    if (!Number.isSafeInteger(durationMs)) fail("--duration must resolve to an exact integer number of milliseconds");
    await checkOutputPath(outputPath, { overwrite: flags.overwrite === true });
    const input = await readBoundedJson(inputPath);
    const project = await createVideoProject(input, { width, height, fps, shotDurationMs: durationMs });
    const result = await saveVideoProject(project, outputPath, { overwrite: flags.overwrite === true });
    process.stdout.write(JSON.stringify({ ok: true, command, path: result.path, bytes: result.bytes, sha256: result.sha256, shots: project.shots.length, duration_ms: project.shots.reduce((sum, shot) => sum + shot.duration_ms, 0) }) + "\n");
    return 0;
  }

  if (command === "preview") {
    const { positionals, flags } = parseFlags(args, ["overwrite"]);
    const [projectPath, outputPath] = requirePaths(positionals, "preview requires a project and an output HTML file");
    assertDifferent([projectPath, outputPath], "Input and output paths must differ");
    if (extname(outputPath).toLowerCase() !== ".html") fail("Output preview must use the .html extension");
    await checkOutputPath(outputPath, { overwrite: flags.overwrite === true });
    const project = await loadVideoProject(projectPath);
    const result = await writeAtomic(outputPath, createPreviewHtml(project), { overwrite: flags.overwrite === true });
    process.stdout.write(JSON.stringify({ ok: true, command, path: result.path, bytes: result.bytes, sha256: result.sha256 }) + "\n");
    return 0;
  }

  const { positionals, flags } = parseFlags(args, ["chrome", "ffmpeg", "timeout", "overwrite"]);
  const [projectPath, outputPath] = requirePaths(positionals, "render requires a project and an output MP4");
  if (extname(outputPath).toLowerCase() !== ".mp4") fail("Output video must use the .mp4 extension");
  const absoluteOutput = resolve(outputPath);
  const absoluteInput = resolve(projectPath);
  const stem = basename(absoluteOutput, extname(absoluteOutput));
  const srtPath = resolve(dirname(absoluteOutput), `${stem}.srt`);
  const vttPath = resolve(dirname(absoluteOutput), `${stem}.vtt`);
  assertDifferent([absoluteInput, absoluteOutput, srtPath, vttPath], "Input, video, and subtitle paths must differ");
  const timeoutMs = integer(flags.timeout ?? "180000", "--timeout", 1000, 600000);
  await checkOutputPath(absoluteOutput, { overwrite: flags.overwrite === true });
  await checkOutputPath(srtPath, { overwrite: flags.overwrite === true });
  await checkOutputPath(vttPath, { overwrite: flags.overwrite === true });
  const project = await loadVideoProject(projectPath);
  const subtitles = generateSubtitles(project);
  const result = await renderVideo(project, { outputPath: absoluteOutput, chromePath: flags.chrome, ffmpegPath: flags.ffmpeg, timeoutMs, overwrite: flags.overwrite === true });
  try {
    await writeAtomic(srtPath, subtitles.srt, { overwrite: flags.overwrite === true });
    await writeAtomic(vttPath, subtitles.vtt, { overwrite: flags.overwrite === true });
  } catch (error) {
    throw new Error(`MP4 saved at ${result.path}, but subtitle writing failed: ${error.message}`);
  }
  process.stdout.write(JSON.stringify({ ok: true, command, path: result.path, bytes: result.bytes, sha256: result.sha256, duration_ms: result.duration_ms, frames: result.frames, srt_path: srtPath, vtt_path: vttPath }) + "\n");
  return 0;
}

main(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((error) => { process.stderr.write(`report-video: ${error.message}\n`); process.exitCode = 1; });
