// SPDX-License-Identifier: MIT
// Copyright 2026 workstonedai-collab
import { createHash, randomUUID } from "node:crypto";
import { link, lstat, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { validateVideoProject } from "./schema.js";

const MAX_BYTES = 24 * 1024 * 1024;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const digest = (value) => createHash("sha256").update(value).digest("hex");

/** Check an output path before expensive work. */
export async function checkOutputPath(outputPath, { overwrite = false } = {}) {
  assert(typeof outputPath === "string" && outputPath.trim(), "outputPath is required");
  assert(typeof overwrite === "boolean", "overwrite must be a boolean");
  const absolute = resolve(outputPath);
  const info = await lstat(absolute).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (info) {
    assert(info.isFile() || info.isSymbolicLink(), `Output is not a regular file: ${absolute}`);
    assert(overwrite, `Output already exists: ${absolute}`);
  }
  return absolute;
}

/** Atomically write a file without leaving temporary files on failure. */
export async function writeAtomic(file, content, { overwrite = false } = {}) {
  assert(typeof file === "string" && file.trim(), "file is required");
  assert(typeof content === "string" || Buffer.isBuffer(content), "content must be a string or Buffer");
  assert(typeof overwrite === "boolean", "overwrite must be a boolean");

  const destination = resolve(file);
  const directory = dirname(destination);
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
  await mkdir(directory, { recursive: true });

  const current = await lstat(destination).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (current) {
    assert(current.isFile() || current.isSymbolicLink(), `Output is not a regular file: ${destination}`);
    assert(overwrite, `Output already exists: ${destination}`);
  }

  const temporary = resolve(directory, `.${basename(destination)}.${randomUUID()}.tmp`);
  let linked = false;
  try {
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }

    if (overwrite) {
      await rename(temporary, destination);
    } else {
      try {
        await link(temporary, destination);
        linked = true;
      } catch (error) {
        if (error.code === "EEXIST") {
          throw new Error(`Output already exists: ${destination}`);
        }
        throw error;
      }
    }
  } finally {
    await unlink(temporary).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }

  return { path: destination, bytes: bytes.length, sha256: digest(bytes) };
}

/** Save a normalized, self-contained video project. */
export async function saveVideoProject(project, projectPath, options = {}) {
  assert(options !== null && typeof options === "object" && !Array.isArray(options), "options must be an object");
  const overwrite = options.overwrite ?? false;
  assert(typeof overwrite === "boolean", "overwrite must be a boolean");
  const normalized = validateVideoProject(project);
  const content = JSON.stringify(normalized, null, 2) + "\n";
  const bytes = Buffer.byteLength(content);
  assert(bytes <= MAX_BYTES, `Project exceeds the 24 MB limit`);
  return writeAtomic(projectPath, content, { overwrite });
}

/** Load and validate a video project, bounding its size before parsing. */
export async function loadVideoProject(projectPath) {
  assert(typeof projectPath === "string" && projectPath.trim(), "projectPath is required");
  const absolute = resolve(projectPath);
  const info = await lstat(absolute).catch((error) => {
    if (error.code === "ENOENT") throw error;
    throw error;
  });
  assert(info.isFile() && !info.isSymbolicLink(), `Project is not a regular file: ${absolute}`);
  assert(info.size <= MAX_BYTES, `Project exceeds the 24 MB limit`);
  const content = await readFile(absolute);
  assert(content.length <= MAX_BYTES, `Project exceeds the 24 MB limit`);

  let parsed;
  try {
    parsed = JSON.parse(content.toString("utf8"));
  } catch {
    throw new Error("Project is not valid JSON");
  }
  return validateVideoProject(parsed);
}
