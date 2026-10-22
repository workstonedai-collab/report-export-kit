# Report Export Kit 视频扩展（v0.2.0 候选版）

> 本文档面向当前分支实现，属于候选版本。扩展尚未发布为 npm 包或公开发行版。

视频扩展是一条独立的本地流水线：把经过校验的结构化报告转换为简单的“静态幻灯片 + 线性进度”MP4。它不改变现有 `exportReport` 协议：PDF、DOCX、Markdown 和记录 XLSX API 仍独立存在，`exportReport` 不接受 `video` 格式。

## 运行要求

- Node.js 22.12 或更高版本
- `npm ci`
- 打开生成的预览以及渲染 MP4 需要 Chrome 或 Chromium
- 渲染 MP4 时需另行安装 FFmpeg，并确保其中有 `libx264` 编码器
- 可选依赖：`playwright-core` 1.64.1；该依赖不会下载浏览器

生成预览 HTML 只需 Node.js 和随包提供的字体素材；打开并使用预览需要现代浏览器；生成 MP4 需要 Chrome 或 Chromium、FFmpeg 和 `playwright-core`。

安装常规依赖：

```sh
npm ci
```

省略可选依赖后，报告、工程和预览功能仍可使用。渲染 MP4 需要 Playwright，请安装可选依赖：

```sh
npm install --include=optional
```

macOS 可运行 `brew install ffmpeg` 安装 FFmpeg；Linux 请按发行版说明安装；Windows 请从官方页面 <https://ffmpeg.org/download.html> 下载，并遵循对应平台的安装说明。FFmpeg 不随本项目打包或再分发，其许可与本项目许可分开。

Chrome/Chromium 自动发现支持 macOS、Linux 和 Windows Program Files 的常见安装位置。也可提供 `chromePath`、使用 `--chrome PATH` 或设置 `CHROME_PATH`。FFmpeg 可通过 `ffmpegPath`、`--ffmpeg PATH` 或系统 `PATH` 指定。路径含空格时请正确加引号。

## 从现有报告快速开始

创建视频工程：

```sh
node src/video/cli.js create examples/video-report.json output/video/project.json
```

用现代 Chrome 或 Chromium 打开生成的预览：

```sh
node src/video/cli.js preview output/video/project.json output/video/preview.html
```

在浏览器中编辑幻灯片，选择 **Save JSON download**，再把下载的 JSON 复制到准备渲染的工程路径。执行：

```sh
node src/video/cli.js render output/video/project.json output/video/film.mp4
```

渲染会生成 `film.mp4`，以及同目录的 `film.srt` 和 `film.vtt` 字幕文件。只有为幻灯片明确填写 caption，字幕才有内容。

预览编辑器的浏览器下载不会自动写回原工程文件。可以直接渲染下载文件的路径，或先复制到所选工程路径；否则渲染旧工程可能得到过期结果。

## 命令行

安装后的 `report-video` 可执行文件等同于 `node src/video/cli.js`。

创建工程：

```sh
node src/video/cli.js create examples/video-report.json output/video/project.json [--width 1280 --height 720 --fps 24 --duration 6 --overwrite]
```

生成预览：

```sh
node src/video/cli.js preview output/video/project.json output/video/preview.html [--overwrite]
```

渲染：

```sh
node src/video/cli.js render output/video/project.json output/video/film.mp4 [--chrome PATH --ffmpeg PATH --timeout 180000 --overwrite]
```

`create`、`preview`、`render` 都要求恰好两个位置参数。工程输入扩展名必须为 `.json`，预览输出为 `.html`，视频输出为 `.mp4`。参数标志可任意排序。默认拒绝覆盖已有目标；`--overwrite` 允许替换，但输入和输出路径无论是否带 `--overwrite` 都不能相同。

渲染前，CLI 会检查 MP4、SRT、VTT 三个输出文件。MP4、工程 JSON、预览 HTML 各自采用原子写入，但三个渲染输出并非一个事务。字幕在 MP4 写入后保存失败时，CLI 会说明已经保存的 MP4 路径。

## 库 API

可以从 `report-export-kit/video` 或仓库的视频入口导入扩展。根入口继续提供原有报告与记录 API。

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

// renderVideo 会写入 MP4，但不会写入字幕文件；
// 它以字符串返回 SRT 和 VTT 内容。
const result = await renderVideo(project, {
  outputPath: 'output/video/film.mp4',
  overwrite: false,
  timeoutMs: 180000,
});
await fs.writeFile('output/video/film.srt', result.srt, 'utf8');
await fs.writeFile('output/video/film.vtt', result.vtt, 'utf8');
```

`createVideoProject` 是异步函数；`validateVideoProject` 和 `createPreviewHtml` 是同步函数；`saveVideoProject` 和 `loadVideoProject` 是异步函数；`renderVideo` 是异步函数；`renderVideoProject(projectPath, outputPath, options)` 是路径包装器。

`generateSubtitles(project)` 返回：

```js
{
  srt: '...',
  vtt: '...',
  duration_ms: 6000,
}
```

工程时间线结构如下：

```js
[{ id: 'shot-1', start_ms: 0, end_ms: 6000 }]
```

运行时不要求供应商、模型、账户或 API key，也不使用遥测或联网获取内容。渲染器只使用传入工程和本地素材。

## 工程与编辑器模型

规范工程 JSON 将“原始报告的规范化完整副本”与“可编辑演示内容”分开保留。`project_version` 是调用方控制的正整数，不是自动变更日志；存在时也会保留 `report.version`。

离线 HTML 编辑器：

- 内嵌 CJK 字体和 PNG 图片，无需获取工程素材；
- 宽屏采用左右布局，窄屏把表单放在幻灯片下方；
- 可编辑幻灯片标题、正文、caption 和时长，时长以 0.5 秒为步进；
- 提供 **Apply**、**Save JSON download** 和用于重新打开已保存修改的 JSON 文件输入框；
- 不使用 localStorage，也不自动保存；
- 浏览器下载 JSON 时不会修改原工程文件。

内嵌 CJK 字体在加入工程素材前约增加 22 MB。原始字体约 16 MB，以 base64 写入后 HTML 会更大。请使用当前版本的 Chrome 或 Chromium 打开编辑器。

也可以在外部编辑 JSON，包括表格数据、注释、PNG 图片和 `source_refs`。每个镜头通过从 0 开始的 `source_refs` 最多引用三个来源。这不是通用视频编辑器、非线性编辑工程，也不是可由 Premiere 导入的工程格式。

caption 默认为空，渲染器不会用 AI 改写。为幻灯片明确添加 caption 后，它才会显示在画面中并进入 SRT/VTT。

扩展没有音频、旁白、生成式媒体、自动叙事压缩、任意 HTML/JavaScript 或远程 URL 素材。长段落按 420 个 Unicode 码点进行感知分页；接近 420 码点正文限制的段落应拆分为多张幻灯片或多个报告。突出重点由读者负责。

## 来源

来源项是纯文本文档参考，不会建立或核验“结论—引用”映射。幻灯片中的 `source_refs` 可选，索引从 0 开始，每个镜头最多三个。默认演示会在致谢/参考页列出全部来源。不要虚构映射；每个引用应指向确实存在且准备使用的来源项。

## 渲染行为与限制

视频由静态幻灯片、线性进度和切换组成，不提供高级动画。帧根据经过时间和用户工程确定性地选择。

支持的参数：

- 横向尺寸：640×360、960×540、1280×720、1920×1080
- 帧率：12、24、30 fps
- 默认：1280×720、24 fps
- 最多 60 张幻灯片
- 总时长最多 180 秒
- 最多 5,400 帧
- 单张时长 1,000～30,000 ms
- 时长必须与帧对齐：`duration_ms × fps` 必须能被 1,000 整除
- 编辑器的 0.5 秒步进因此只是有效时长的子集
- 工程最大 24 MB，包括原始报告和重复保存的 PNG 演示数据

演示内容限制包括：标题 90 个 Unicode 码点、正文 420、caption 100；每页表格最多 4 列 6 行，每个单元格 60；注释 160；致谢中的标题/机构/日期/URL 分别为 90/90/40/220 个码点。

构建器会拒绝过长的标题、注释、单元格及其他无效值，不会静默裁剪。即使字符数通过校验，最终浏览器布局仍可能因很多换行或异常长行而溢出。应把过长用户内容拆成更小的报告、工程或幻灯片，不要无限缩小字体。使用其他工具前应先设置工程限制。

MP4 使用 H.264、`yuv420p`，不含音频。渲染以流式方式处理 JPEG 帧，帧缓冲和输出各上限 512 MB。渲染时阻止网络访问，本地解码内嵌字体和 PNG。默认超时为 180 秒，可设置为 1～600 秒。渲染失败时，已有 MP4 保持不变，临时文件会被清理。

## 示例

```sh
npm run demo:video
```

它会构建一个完全虚构的 28 秒、7 张幻灯片报告和 PNG 图表，并写入：

- `output/video/project.json`
- `output/video/preview.html`
- `output/video/report.json`

重复执行 demo 只覆盖上述已知文件，不会自动渲染 MP4。完成后运行：

```sh
node src/video/cli.js render output/video/project.json output/video/film.mp4
```

## 验证

运行常规测试：

```sh
npm test
```

测试覆盖核心、CLI 和现有报告导出；浏览器相关用例在没有提供所需环境时会明确跳过。在 macOS 或 Linux 上可选择启用：

```sh
REPORT_VIDEO_TEST_CHROME='path/to/chrome' REPORT_VIDEO_TEST_FFMPEG='path/to/ffmpeg' node --test test/video-browser.test.js
```

Windows PowerShell 应使用 PowerShell 的环境变量语法；具体命令因 shell 和 PowerShell 版本而异。未实际运行相应检查前，不要声称浏览器往返验证或 CI 已通过。

已验证的本地范围、通过数量、超时行为和剩余验收工作见 [video-verification.md](video-verification.md)。远端 CI job 仍在等待；实时状态见 [GitHub Actions](https://github.com/workstonedai-collab/report-export-kit/actions)。尚未执行干净安装冒烟测试。

## 编辑规范工程

找到文字镜头，更新可编辑字段，校验并保存。规范工程会单独保留原始报告：

```js
const textShot = project.shots.find((shot) => shot.kind === 'text');
if (!textShot) throw new Error('No text shot found');

textShot.body = '更新后的正文。';
textShot.caption = '更新后的字幕';
textShot.duration_ms = 4000;

validateVideoProject(project);
await saveVideoProject(project, 'output/video/project.json', { overwrite: true });
```

文字镜头的 `shot.body`、`shot.caption` 和 `shot.duration_ms` 可编辑。表格镜头的演示数据位于 `shot.table.headers`、`shot.table.rows` 和 `shot.table.note`，标题位于 `shot.title`。

## 常见问题

| 现象 | 检查方法 |
| --- | --- |
| 找不到 FFmpeg 或缺少 H.264 | 单独安装 FFmpeg，确认有 `libx264` 编码器；不在 `PATH` 时使用 `--ffmpeg PATH`。 |
| 找不到 Chrome/Chromium | 确认浏览器已安装，或使用 `--chrome PATH`、`chromePath`、设置 `CHROME_PATH`。 |
| 缺少 Playwright | 执行 `npm install --include=optional`；`playwright-core` 不会下载浏览器。 |
| 布局溢出被拒绝 | 缩短内容或拆分幻灯片/工程；字符校验本身不能保证浏览器布局。 |
| 编辑结果没有出现 | 下载并保存 JSON，再加载最新文件或渲染其路径；浏览器不会更新原工程。 |
| 字幕为空 | 为幻灯片明确添加 caption；工具不会自动生成字幕。 |
| 预览 HTML 很大 | 内嵌 CJK 字体在加入其他素材前已经占用较多空间。 |
| 输出已存在 | 更换路径或使用 `--overwrite`；输入和输出路径始终必须不同。 |

## 使用边界

这是本地幻灯片渲染器，不是 AI 视频 Agent 或通用创意套件。它不提供音频、语音、生成式媒体、叙事改写、来源核验、任意网络素材、高级动画或 NLE 互操作。分发前请检查内容、引用、许可以及浏览器和 FFmpeg 的安装要求。
