# Third-party notices / 第三方说明

The unmodified Noto Sans CJK SC font is obtained from the official [Noto CJK project](https://github.com/notofonts/noto-cjk/tree/main/Sans). It keeps its original name and embedded metadata. Its SIL Open Font License 1.1 is distributed as `fonts/OFL.txt`, independently of the code's MIT license. `npm run setup-font` restores the font and its license from that official repository if needed.

PDFKit and JSZip are installed from npm; their respective licenses are retained in their packages. This project does not bundle third-party report content or external datasets. Demonstration numbers and prose are synthetic; the chart renderer draws original pixels locally.

本项目保留 Noto Sans CJK SC 原始字体名称和元数据，随包提供独立 OFL 1.1 许可，代码 MIT 许可不会替代字体和依赖自身条款。演示内容为虚构，图表像素由本地程序生成。

The optional `playwright-core` 1.64.1 dependency is distributed under the Apache License 2.0. It does not download a browser. Chrome/Chromium and FFmpeg are installed separately by the user, are not bundled or redistributed by this project, and retain their own licenses and terms.

可选依赖 `playwright-core` 1.64.1 采用 Apache License 2.0，不会下载浏览器。Chrome/Chromium 与 FFmpeg 需由用户另行安装，不由本项目打包或再分发，并保留各自许可与条款。
