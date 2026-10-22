# Report Export Kit video extension (v0.2.0 candidate)

> Candidate documentation for the branch implementation. This extension is not yet published as an npm package or a public release.

The video extension is a separate local pipeline for turning a validated structured report into a simple narrated-by-slides MP4. It does not change the existing `exportReport` contract: PDF, DOCX, Markdown, and the record XLSX API remain separate, and `exportReport` does not accept `video` as a format.

## Requirements

- Node.js 22.12 or newer
- `npm ci`
- Chrome or Chromium for opening the generated preview and for MP4 rendering
- FFmpeg installed separately, with the `libx264` encoder available, for MP4 rendering
- Optional package: `playwright-core` 1.64.1; no browser is downloaded by this package

Generating the preview HTML requires only Node.js and the bundled font assets. Opening and using the preview requires a modern browser. Producing an MP4 requires Chrome or Chromium, FFmpeg, and `playwright-core`.

Install normal dependencies with:

```sh
npm ci
```

The report, project, and preview features work when optional dependencies are omitted. MP4 rendering requires Playwright, so install the optional dependency with:

```sh
npm install --include=optional
```

On macOS, FFmpeg can be installed with `brew install ffmpeg`. On Linux, use the instructions for your distribution. On Windows, obtain FFmpeg from the official download page at <https://ffmpeg.org/download.html> and follow the instructions for your platform. FFmpeg is not bundled or redistributed, and its license is separate from this project's license.

Chrome/Chromium auto-discovery supports standard macOS, Linux, and Windows Program Files locations. You can also provide `chromePath`, use `--chrome PATH`, or set `CHROME_PATH`. Likewise, provide FFmpeg with `ffmpegPath`, `--ffmpeg PATH`, or the system `PATH`. Quote paths containing spaces.

## Quick start from an existing report

Create a project:

```sh
node src/video/cli.js create examples/video-report.json output/video/project.json
```

Open the generated preview in a modern Chrome or Chromium browser:

```sh
node src/video/cli.js preview output/video/project.json output/video/preview.html
```

Edit the slides in the browser, select **Save JSON download**, then copy the downloaded JSON to the project path you intend to render. Render it:

```sh
node src/video/cli.js render output/video/project.json output/video/film.mp4
```

Rendering writes `film.mp4` and sibling subtitle files `film.srt` and `film.vtt`. Captions are empty unless you explicitly add a caption to each slide.

The preview editor's browser download does not write back to the original project file. Render the downloaded JSON path directly, or copy it over the selected project path first. Rendering an older project can otherwise produce a stale result.

## CLI

The installed `report-video` binary is equivalent to `node src/video/cli.js`.

Create a project:

```sh
node src/video/cli.js create examples/video-report.json output/video/project.json [--width 1280 --height 720 --fps 24 --duration 6 --overwrite]
```

Preview a project:

```sh
node src/video/cli.js preview output/video/project.json output/video/preview.html [--overwrite]
```

Render a project:

```sh
node src/video/cli.js render output/video/project.json output/video/film.mp4 [--chrome PATH --ffmpeg PATH --timeout 180000 --overwrite]
```

`create`, `preview`, and `render` each require exactly two positional arguments. The project input must have a `.json` extension, the preview output a `.html` extension, and the video output a `.mp4` extension. Flags may appear in any order. Existing targets are refused by default. `--overwrite` permits replacement, except that an input and output path may never be the same, even with `--overwrite`.

Before rendering, the CLI checks for all three output files: the MP4 and its SRT/VTT siblings. The MP4, project JSON, and preview HTML are each written atomically, but the three render outputs are not one transactional set. If subtitle writing fails after the MP4 has been written, the CLI explains the saved MP4 path.

## Library API

The extension can be imported from `report-export-kit/video` or the repository's video entry point. Existing root exports continue to expose the established report and record APIs.

```js
import fs from 'node:fs/promises';
import {
  createVideoProject,
  validateVideoProject,
  createPreviewHtml,
  saveVideoProject,
  loadVideoProject,
  renderVideo,
  renderVideoProject,
  generateSubtitles,
} from 'report-export-kit/video';

const report = JSON.parse(await fs.readFile('examples/video-report.json', 'utf8'));
const project = await createVideoProject(report, {
  width: 1280,
  height: 720,
  fps: 24,
  shotDurationMs: 6000,
});

validateVideoProject(project);
await saveVideoProject(project, 'output/video/project.json', { overwrite: false });
await fs.writeFile(
  'output/video/preview.html',
  createPreviewHtml(project, { editor: true }),
  'utf8',
);

// renderVideo writes the MP4 but does not write subtitle files;
// it returns the SRT and VTT contents as strings.
const result = await renderVideo(project, {
  outputPath: 'output/video/film.mp4',
  overwrite: false,
  timeoutMs: 180000,
});
await fs.writeFile('output/video/film.srt', result.srt, 'utf8');
await fs.writeFile('output/video/film.vtt', result.vtt, 'utf8');
```

`createVideoProject` is asynchronous. `validateVideoProject` and `createPreviewHtml` are synchronous. `saveVideoProject` and `loadVideoProject` are asynchronous. `renderVideo` is asynchronous, and `renderVideoProject(projectPath, outputPath, options)` is the path-based wrapper.

`generateSubtitles(project)` returns:

```js
{
  srt: '...',
  vtt: '...',
  duration_ms: 6000,
}
```

The project timeline has the shape:

```js
[{ id: 'shot-1', start_ms: 0, end_ms: 6000 }]
```

No provider, model, account, API key, telemetry, or runtime network content fetch is required. The renderer works from the supplied project and local assets only.

## Project and editor model

The canonical project JSON retains the original normalized full report separately from its editable presentation. `project_version` is a caller-controlled positive integer; it is not an automatic changelog. `report.version` is likewise preserved when present.

The offline HTML editor:

- embeds a CJK font and PNG images, so it works without fetching project assets;
- uses a two-column layout on wider screens and places the form below the slides on narrower screens;
- permits editing slide title, body, caption, and duration in 0.5-second steps;
- provides **Apply**, **Save JSON download**, and a JSON file input for reopening saved edits;
- does not use local storage or autosave;
- does not modify the original project file when the browser downloads JSON.

The embedded CJK font adds about 22 MB before project assets. The original font is about 16 MB and is represented as base64, which increases the HTML size. Use the editor in a current Chrome or Chromium release.

You may edit the JSON externally, including table data, notes, PNG images, and `source_refs`. Each shot may reference at most three sources through its zero-based `source_refs` entries. This is not a general video editor, non-linear editing project, or Premiere-compatible project format.

Captions default to empty. The renderer does not rewrite them with AI. Add an explicit caption to a slide to show it in the embedded caption and to include it in SRT/VTT.

There is no audio, voice-over, generative media, automatic narrative condensation, arbitrary HTML/JavaScript, or remote URL assets. Long paragraphs are paginated automatically using Unicode-aware pagination at 420 code points. Split paragraphs that approach the 420-code-point body limit into multiple slides or reports. Highlighting important text remains the reader's responsibility.

## Sources

Source entries are plaintext document references. The extension does not create or verify a mapping between claims and references. `source_refs` in slides are optional zero-based source indices, with at most three entries per shot. The default presentation includes a credits/reference slide containing all sources. Do not invent source mappings; a slide's references should identify the supplied source entries you intend to cite.

## Rendering behavior and limits

The video is a sequence of static slides with linear progress and cuts. It does not provide advanced animation. Frames are selected deterministically from elapsed time and the user-supplied project.

Supported settings are:

- Landscape sizes: 640×360, 960×540, 1280×720, 1920×1080
- Frame rates: 12, 24, or 30 fps
- Defaults: 1280×720 at 24 fps
- Up to 60 slides
- Total duration up to 180 seconds
- Up to 5,400 frames
- Slide duration from 1,000 through 30,000 ms
- Slide duration must be frame-aligned: `duration_ms × fps` must be divisible by 1,000
- Editor duration steps of 0.5 seconds are therefore a subset of valid durations
- Project size up to 24 MB, including the original report and duplicated PNG presentation data

Presentation limits include a 90-Unicode-code-point title, 420-code-point body, 100-code-point caption, four table columns and six rows per page, 60 code points per table cell, a 160-code-point note, and credits fields of 90/90/40/220 code points for title/publisher/date/URL.

The builder rejects oversized titles, notes, cells, and other invalid values instead of silently clipping them. Final browser layout can still overflow because of many line breaks or unusually long rows even when character counts pass validation. Split long user content into smaller reports, projects, or slides instead of continually shrinking the font. Set project limits before using other tools.

Rendered MP4 output is H.264 with `yuv420p` and no audio. Rendering streams JPEG frames with a 512 MB frame-buffer cap and a 512 MB output cap. Network access is blocked during rendering, while the embedded font and PNGs are decoded locally. The default timeout is 180 seconds and may be set from 1 through 600 seconds. If rendering fails, an existing MP4 is left unchanged and temporary files are cleaned up.

## Example

```sh
npm run demo:video
```

This builds a completely fictional 28-second, seven-slide report with a PNG chart and writes:

- `output/video/project.json`
- `output/video/preview.html`
- `output/video/report.json`

Repeating the demo overwrites only those known files. It does not automatically render an MP4. After it finishes, run:

```sh
node src/video/cli.js render output/video/project.json output/video/film.mp4
```

## Verification

Run the regular test suite:

```sh
npm test
```

It covers the core, CLI, and existing report exports. Browser-dependent cases are explicitly skipped unless the required environment is supplied. To opt in on macOS or Linux:

```sh
REPORT_VIDEO_TEST_CHROME='path/to/chrome' REPORT_VIDEO_TEST_FFMPEG='path/to/ffmpeg' node --test test/video-browser.test.js
```

On Windows PowerShell, set the environment variables using PowerShell's environment syntax; exact command syntax varies by shell and PowerShell version. Do not claim browser round-trip verification or CI success without running the corresponding checks.

The verified local scope, pass counts, timeout behavior, and remaining acceptance work are recorded in [video-verification.md](video-verification.md). The remote CI job is still pending; its live status is available through [GitHub Actions](https://github.com/workstonedai-collab/report-export-kit/actions). A clean-install smoke test has not yet been run.

## Editing a canonical project

Find a text shot, update its editable fields, validate it, and save it. The original report remains preserved separately in the canonical project:

```js
const textShot = project.shots.find((shot) => shot.kind === 'text');
if (!textShot) throw new Error('No text shot found');

textShot.body = 'Updated body text.';
textShot.caption = 'Updated caption';
textShot.duration_ms = 4000;

validateVideoProject(project);
await saveVideoProject(project, 'output/video/project.json', { overwrite: true });
```

For a text shot, `shot.body`, `shot.caption`, and `shot.duration_ms` are editable. A table shot stores its presentation data at `shot.table.headers`, `shot.table.rows`, and `shot.table.note`; its title is stored at `shot.title`.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| FFmpeg is missing or lacks H.264 | Install FFmpeg separately and confirm that the `libx264` encoder is available. Pass `--ffmpeg PATH` if it is not on `PATH`. |
| Chrome or Chromium is not found | Confirm the browser is installed, or pass `--chrome PATH` / set `chromePath` / set `CHROME_PATH`. |
| Playwright is missing | Install optional dependencies with `npm install --include=optional`; `playwright-core` does not download a browser. |
| Layout overflow is rejected | Shorten content or split it across slides/projects. Character validation alone cannot guarantee browser layout. |
| Editor changes do not appear | Download and save the JSON, then load that latest file or render its path. The browser does not update the original project. |
| Subtitles are empty | Add an explicit caption to each slide; captions are not generated automatically. |
| Preview HTML is large | The embedded CJK font adds substantial size before other assets. |
| Output already exists | Choose another path or use `--overwrite`; input and output paths must remain different. |

## Scope

The extension is a local slideshow renderer, not an AI video agent or general creative suite. It does not add audio, speech, generated media, narrative rewriting, source verification, arbitrary web assets, advanced animation, or NLE interoperability. Review content, citations, licenses, and browser/FFmpeg installation requirements before distribution.
