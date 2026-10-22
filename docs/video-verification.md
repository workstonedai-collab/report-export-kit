# Video verification / 视频验证记录

## Release identity / 发布身份

- Stable tag: `v0.1.0`
- Current package version: `0.2.0` on the candidate branch
- No new GitHub release was published.
- No npm publication is claimed.
- License remains MIT.

稳定标签为 `v0.1.0`。当前候选分支的包版本为 `0.2.0`；没有发布新的 GitHub Release，也不声称已发布到 npm。许可证仍为 MIT。

## Verified local scope / 已验证的本地范围

Verification was performed on 2026-10-22 with macOS 26.6.2 arm64, Node.js 22.23.1, Chrome 155.0.8059.86, and FFmpeg 7.1 with `libx264`.

验证于 2026-10-22 执行，环境为 macOS 26.6.2 arm64、Node.js 22.23.1、Chrome 155.0.8059.86，以及带 `libx264` 的 FFmpeg 7.1。

- `npm test` passed 32 cases and explicitly skipped 3 opt-in cases.
- A separate opt-in browser run passed all 3 cases with 0 skips.
- Across both runs, 35 distinct tests passed. The 32 passing regular-run cases include the existing 7 report/XLSX tests.
- The browser checks covered every project kind, offline files, hostile text, literal backslashes, and source URLs. Remote URLs were not fetched, and layout overflow was rejected.
- Desktop and narrow-viewport editor bounds were regression-tested at 1440×1000 and 375×900 after adding ResizeObserver-based adaptive scaling.
- The real editor check selected and edited a title, body, caption, and duration; downloaded JSON; loaded the saved file; and reopened it.
- A real 2-second, 24-frame render and an edited 3.5-second, 42-frame, 640×360, 12 fps, silent H.264 MP4 were produced. FFmpeg decoded the complete files, early and late frames differed, and subtitles remained aligned.
- `npm run demo` produced PDF, DOCX, and Markdown outputs successfully.
- A separate real 28-second, 672-frame, 1280×720, 24 fps, seven-shot fictional sample was rendered. FFmpeg decoded it fully with exit code 0 and no audio. Its title, table, chart, and credits were visually inspected.

`npm test` 通过 32 个用例，并明确跳过 3 个需主动启用的用例。另行主动启用浏览器测试后，3 个用例全部通过且跳过数为 0。两次运行合计覆盖 35 个不同测试；常规运行的 32 个通过用例包含既有的 7 个报告/XLSX 测试。

浏览器检查覆盖所有工程类型、离线文件、恶意文本、字面反斜杠和来源 URL；远程 URL 未被获取，布局溢出会被拒绝。真实编辑器检查完成选择与编辑标题、正文、caption 和时长，下载 JSON，加载保存文件并重新打开。实际生成了 2 秒 24 帧，以及编辑后的 3.5 秒 42 帧、640×360、12 fps、无声 H.264 MP4；FFmpeg 完整解码，早期帧与晚期帧不同，字幕对齐。

加入 ResizeObserver 自适应缩放后，桌面与窄视口编辑器边界已在 1440×1000 和 375×900 下完成回归测试。

`npm run demo` 的 PDF、DOCX 和 Markdown 均成功。另一次真实渲染完成了 28 秒、672 帧、1280×720、24 fps、7 个镜头的虚构示例；FFmpeg 完整解码且退出码为 0，没有音频。标题、表格、图表和致谢均经目视检查。

## Timeout behavior / 超时行为

A failure case was independently tested with `timeoutMs: 1000`, `overwrite: true`, and an existing sentinel output. Preview setup timed out and returned after approximately 6.4 seconds, including cleanup. The existing output was preserved, and the temporary folder contained only the sentinel file.

The measured return time may exceed the configured deadline because cleanup can add several seconds.

另以 `timeoutMs: 1000`、`overwrite: true` 和已有哨兵文件独立测试失败路径。预览设置阶段超时后，包含清理时间在内约 6.4 秒返回；已有输出保持不变，临时目录中仅保留哨兵文件。

由于清理可能额外耗时数秒，实测返回时间可能超过配置的超时期限。

## Cross-platform acceptance / 跨平台验收

- Local browser acceptance was performed on macOS. Local Windows and Linux browser runs were not performed.
- The cross-platform test matrix and the Ubuntu MP4 job are configured in CI. The latest remote outcomes are available from the [GitHub Actions workflow](https://github.com/workstonedai-collab/report-export-kit/actions).
- Local acceptance does not replace the remote Ubuntu evidence; the workflow link remains the source of truth for current CI status.

本地浏览器验收在 macOS 上执行，未在本地 Windows 或 Linux 浏览器上执行。跨平台测试矩阵与 Ubuntu MP4 job 已配置；最新远端结果见 [GitHub Actions 工作流](https://github.com/workstonedai-collab/report-export-kit/actions)。本地验收不替代远端 Ubuntu 证据，当前 CI 状态以该工作流链接为准。

## Clean tarball install / 干净 tarball 安装

A clean consumer-folder smoke test passed using:

```sh
npm install --omit=optional --ignore-scripts /local/report-export-kit-0.2.0.tgz
```

With optional dependencies omitted, `playwright-core` was not installed. Imports from both the package root and `report-export-kit/video` worked. Project creation, JSON save, and offline HTML preview worked. Existing Markdown output and record XLSX output also worked, as did the package binary help command.

Installing with optional dependencies included added `playwright-core`. The installed package's CLI then rendered `project.json` to `installed.mp4` successfully: 2 seconds, 24 frames, 640×360, 12 fps, and 7,988 bytes. The MP4, SRT, and VTT outputs were written. This fixture's generated caption sidecars are empty; subtitle alignment was proved separately by the real edited-subtitle browser flow. Existing PDF and DOCX outputs were also exported from the installed package: 62,026 bytes for PDF and 1,972 bytes for DOCX.

已在全新的空 consumer 文件夹中使用以下命令通过干净安装冒烟测试：

```sh
npm install --omit=optional --ignore-scripts /local/report-export-kit-0.2.0.tgz
```

省略可选依赖后，未安装 `playwright-core`。包根入口与 `report-export-kit/video` 子路径导入均正常；项目创建、JSON 保存和离线 HTML 预览正常；既有 Markdown 输出、记录 XLSX 输出及包命令帮助也均正常。

包含可选依赖安装后，已添加 `playwright-core`。随后使用已安装包的 CLI 将 `project.json` 成功渲染为 `installed.mp4`：2 秒、24 帧、640×360、12 fps、7,988 字节，并写入 MP4、SRT 与 VTT。该测试样例生成的字幕 sidecar 内容为空；字幕对齐已由独立的真实编辑字幕浏览器流程验证。已安装包还成功导出既有 PDF 与 DOCX，分别为 62,026 字节和 1,972 字节。

## Verification attribution / 验证归因

All implementation, tests, fixes, and documentation in this work were generated by MiniMax. The maintainer executed the verification described above.

本次工作的全部实现、测试、修复和文档均由 MiniMax 生成；上述验证由维护者执行。
