// SPDX-License-Identifier: MIT
// Copyright 2026 workstonedai-collab

export { createVideoProject } from "./builder.js";
export { validateVideoProject } from "./schema.js";
export { generateSubtitles, timeline } from "./subtitles.js";
export { createPreviewHtml } from "./preview.js";
export { renderVideo } from "./render.js";
export { saveVideoProject, loadVideoProject } from "./files.js";

import { loadVideoProject } from "./files.js";
import { renderVideo } from "./render.js";

export async function renderVideoProject(projectPath, outputPath, options = {}) {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("options must be an object");
  }
  const project = await loadVideoProject(projectPath);
  return renderVideo(project, { ...options, outputPath });
}
