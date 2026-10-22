// SPDX-License-Identifier: MIT
// Copyright 2026 workstonedai-collab
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { barChart } from "../src/charts.js";
import { createVideoProject, createPreviewHtml, validateVideoProject } from "../src/video/index.js";
import { writeAtomic } from "../src/video/files.js";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "output", "video");
await mkdir(output, { recursive: true });
const sample = JSON.parse(await readFile(resolve(root, "examples", "video-report.json"), "utf8"));
const chart = barChart([12, 18, 15], { width: 720, height: 300 });
sample.blocks.push({ type: "image", data: chart.toString("base64"), title: "Synthetic trend / 合成趋势", note: "Illustrative values only / 仅为虚构示例" });
const project = await createVideoProject(sample, { width: 1280, height: 720, fps: 24, shotDurationMs: 4000 });
const captions = [
  "欢迎查看本地生成的视频报告。",
  "This fully fictional sample demonstrates bilingual narration.",
  "示例数据仅用于展示图表与表格排版。",
  "项目已保存，可在预览中编辑后继续渲染。",
  "数字均为虚构，不构成任何真实业务结论。",
];
project.shots.forEach((shot, index) => { shot.caption = captions[index % captions.length]; });
const validated = validateVideoProject(project);
await writeFile(resolve(output, "report.json"), JSON.stringify(sample, null, 2) + "\n", "utf8");
await writeAtomic(resolve(output, "project.json"), JSON.stringify(validated, null, 2) + "\n", { overwrite: true });
await writeAtomic(resolve(output, "preview.html"), createPreviewHtml(validated), { overwrite: true });
console.log(`Saved ${resolve(output, "project.json")}`);
console.log(`Saved ${resolve(output, "preview.html")}`);
console.log("Next: report-video render output/video/project.json output/video/demo.mp4");
