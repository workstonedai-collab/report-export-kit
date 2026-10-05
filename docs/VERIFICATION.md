# Verification / 验证记录

Date: 2026-10-05. Local platform: macOS, Node.js 22.23.1.

5 automated tests passed. / 5 项自动测试通过。

PDF, DOCX and Markdown; input immutability; multi-page Chinese/English tables; embedded PNG and Markdown image assets. The synthetic PDF was rendered for visual inspection and text extraction. DOCX XML/media were inspected; no Office application visual acceptance is claimed. / 三种导出、输入不变、多页双语表格及图片通过验证；PDF 已渲染与提取文字检查；DOCX 已检查结构，未宣称 Office 应用排版验收。

CI is configured for Node 22/24 on Linux, macOS and Windows. Use the live CI badge for current remote results. / 配置三种系统及两种 Node 版本的 CI，当前远端结果请查看 CI 徽章。

All demo content is synthetic. Generated output, local state, secrets and deployment bindings are excluded. / 演示内容为合成样例，生成结果、本地状态、密钥和部署绑定不纳入发布。
