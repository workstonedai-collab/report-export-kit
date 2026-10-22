// SPDX-License-Identifier: MIT
// Copyright (c) 2026 workstonedai-collab

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateVideoProject } from './schema.js';

const FONT_PATH = fileURLToPath(new URL('../../fonts/NotoSansCJKsc-Regular.otf', import.meta.url));
let fontData;
let fontBase64;

function getFontBase64() {
  if (!fontBase64) {
    fontData = readFileSync(FONT_PATH);
    fontBase64 = fontData.toString('base64');
  }
  return fontBase64;
}

function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createPreviewHtml(project, options = { editor: true }) {
  const checked = validateVideoProject(project);
  const editor = options.editor !== false;
  const canvas = checked.canvas;
  const font = getFontBase64();
  const browserValidator = validateVideoProject.toString();
  const initial = safeJson(checked);
  const totalDuration = checked.shots.reduce((sum, shot) => sum + shot.duration_ms, 0);

  const css = `
    @font-face {
      font-family: ReportCJK;
      src: url(data:font/otf;base64,${font}) format('opentype');
      font-display: block;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      min-height: 100%;
      background: #eeeae3;
      color: #172235;
      font-family: ReportCJK, Arial, sans-serif;
    }
    body { overflow-x: hidden; }
    .app { max-width: 1500px; margin: 0 auto; padding: 18px; }
    .top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 14px;
    }
    .brand { font-size: 25px; font-weight: 700; overflow-wrap: anywhere; }
    .meta { font-size: 14px; color: #526071; }
    .workspace {
      display: grid;
      grid-template-columns: 235px minmax(360px, 1fr) 300px;
      gap: 14px;
      align-items: start;
    }
    .panel {
      background: #f8f6f1;
      border: 1px solid #d8d2c8;
      border-radius: 10px;
      padding: 13px;
    }
    .shots { max-height: 690px; overflow: auto; }
    .shotbutton {
      width: 100%;
      text-align: left;
      border: 1px solid #cfc8bc;
      background: #fff;
      padding: 10px;
      margin: 0 0 7px;
      border-radius: 7px;
      cursor: pointer;
      color: #172235;
      font: inherit;
    }
    .shotbutton.active { border-color: #b46b42; background: #fff8ed; }
    .shotbutton small { display: block; color: #697587; margin-top: 3px; }
    .viewer { background: #101a2b; padding: 18px; border-radius: 10px; }
    .stagebox {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 9;
      overflow: hidden;
      background: #101a2b;
    }
    .stage {
      position: absolute;
      left: 0;
      top: 0;
      width: 1280px;
      height: 720px;
      transform-origin: top left;
      background: #f5efe3;
      color: #172235;
      overflow: hidden;
    }
    .content {
      position: absolute;
      left: 58px;
      right: 58px;
      top: 46px;
      bottom: 76px;
      display: flex;
      flex-direction: column;
      overflow: visible;
    }
    .stage h1 {
      font-size: 46px;
      line-height: 1.4;
      margin: 0 0 10px;
      flex: 0 0 auto;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .stage h2 {
      font-size: 31px;
      line-height: 1.3;
      margin: 0 0 18px;
      flex: 0 0 auto;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .stage .body {
      font-size: 28px;
      line-height: 1.42;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      word-break: break-word;
      margin: 0 0 10px;
      flex: 0 0 auto;
    }
    .stage .caption {
      font-size: 24px;
      line-height: 1.35;
      margin-top: auto;
      border-top: 2px solid #b46b42;
      padding-top: 12px;
      flex: 0 0 auto;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .stage .imagewrap {
      min-height: 0;
      flex: 1 1 auto;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .stage img {
      max-width: 100%;
      max-height: 100%;
      width: auto;
      height: auto;
      object-fit: contain;
    }
    .stage .tablewrap {
      font-size: 24px;
      line-height: 1.25;
      flex: 0 0 auto;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .stage table { border-collapse: collapse; width: 100%; table-layout: fixed; }
    .stage td, .stage th {
      border: 1px solid #9e9586;
      padding: 8px;
      vertical-align: top;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .stage .note { font-size: 22px; line-height: 1.3; margin-top: 10px; flex: 0 0 auto; overflow-wrap: anywhere; }
    .stage .sources { font-size: 23px; line-height: 1.4; flex: 0 0 auto; overflow-wrap: anywhere; }
    .stage .source { margin: 0 0 14px; flex: 0 0 auto; }
    .stage .source b { font-size: 25px; display: block; }
    .stage .source .url { color: #536477; font-size: 20px; word-break: break-all; }
    .stage .source .publisher { color: #4f5b6b; }
    .footer {
      position: absolute;
      left: 58px;
      right: 58px;
      bottom: 12px;
      display: flex;
      justify-content: space-between;
      gap: 20px;
      font-size: 18px;
      color: #596477;
    }
    .footer span { overflow-wrap: anywhere; }
    .progress {
      height: 5px;
      background: #d9d0c3;
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
    }
    .progress i { display: block; height: 100%; background: #b46b42; }
    .editor label { display: block; font-size: 13px; font-weight: 700; margin: 10px 0 4px; }
    .editor input, .editor textarea, .editor select {
      width: 100%;
      font: inherit;
      padding: 8px;
      border: 1px solid #bbb3a7;
      border-radius: 5px;
      background: #fff;
    }
    .editor textarea { min-height: 120px; resize: vertical; }
    .actions { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 12px; align-items: center; }
    .actions button, .play, .shotbutton {
      font: inherit;
    }
    .actions button, .play {
      padding: 8px 12px;
      border: 1px solid #9e9586;
      border-radius: 5px;
      background: #fff;
      cursor: pointer;
      color: #172235;
    }
    .actions .primary { background: #b46b42; color: #fff; border-color: #b46b42; }
    .status { min-height: 22px; font-size: 13px; margin-top: 10px; color: #344358; }
    .status.error { color: #a12e25; font-weight: 700; }
    .seek { width: 100%; margin-top: 10px; }
    .subhead { font-size: 16px; font-weight: 700; margin-bottom: 8px; }
    .hint { font-size: 12px; color: #687486; margin-top: 8px; }
    .viewer-only {
      width: ${canvas.width}px;
      height: ${canvas.height}px;
      min-width: ${canvas.width}px;
      min-height: ${canvas.height}px;
      overflow: hidden;
      background: #f5efe3;
    }
    .viewer-only .app { width: ${canvas.width}px; height: ${canvas.height}px; padding: 0; max-width: none; }
    .viewer-only .workspace { display: block; width: ${canvas.width}px; height: ${canvas.height}px; }
    .viewer-only .viewer { width: ${canvas.width}px; height: ${canvas.height}px; padding: 0; border-radius: 0; background: #f5efe3; }
    .viewer-only .stagebox { width: ${canvas.width}px; height: ${canvas.height}px; aspect-ratio: auto; }
    .viewer-only .stage { transform: scale(${canvas.width / 1280}); }
    .hidden { display: none !important; }
    @media (max-width: 1000px) {
      .workspace { grid-template-columns: 200px 1fr; }
      .editor { grid-column: 1 / -1; }
      .shots { max-height: 300px; }
    }
    @media (max-width: 650px) {
      .workspace { display: block; }
      .panel { margin-bottom: 12px; }
      .app { padding: 10px; }
      .stagebox { aspect-ratio: 16 / 9; }
      .viewer { padding: 8px; }
    }
  `;

  const script = `
    (function () {
      'use strict';

      const initialProject = ${initial};
      const validator = (${browserValidator});
      let project = JSON.parse(JSON.stringify(initialProject));
      let current = 0;
      let selectedForm = 0;
      let playing = false;
      let raf = 0;
      let playbackStart = 0;
      let playbackOffset = 0;
      let renderToken = 0;

      const $ = function (id) { return document.getElementById(id); };
      const clone = function (value) { return JSON.parse(JSON.stringify(value)); };
      const make = function (tag, className, value) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (value !== undefined) element.textContent = value == null ? '' : String(value);
        return element;
      };
      const clear = function (element) {
        while (element.firstChild) element.removeChild(element.firstChild);
      };
      const totalDuration = function () {
        return project.shots.reduce(function (sum, shot) { return sum + shot.duration_ms; }, 0);
      };
      const shotAt = function (ms) {
        let start = 0;
        for (let index = 0; index < project.shots.length; index += 1) {
          const end = start + project.shots[index].duration_ms;
          if (ms < end) return { index: index, start: start };
          start = end;
        }
        const last = project.shots.length - 1;
        return { index: last, start: start - project.shots[last].duration_ms };
      };
      const setText = function (element, value) {
        if (element) element.textContent = value == null ? '' : String(value);
      };
      const fail = function (error) {
        const status = $('status');
        if (status) {
          status.textContent = error instanceof Error ? error.message : String(error);
          status.className = 'status error';
        }
      };
      const succeed = function (message) {
        const status = $('status');
        if (status) {
          status.textContent = message;
          status.className = 'status';
        }
      };
      const updateMeta = function () {
        const title = $('project-title');
        const meta = $('project-meta');
        setText(title, project.report.title);
        const duration = totalDuration() / 1000;
        setText(meta, project.report.version + ' · ' + project.canvas.width + '×' +
          project.canvas.height + ' · ' + duration + 's · ' +
          project.report.sources.length + ' sources');
      };
      const updateActive = function () {
        const box = $('shots');
        if (!box) return;
        const buttons = box.querySelectorAll('.shotbutton');
        buttons.forEach(function (button, index) {
          button.classList.toggle('active', index === current);
        });
      };
      const updateList = function () {
        const box = $('shots');
        if (!box) return;
        clear(box);
        project.shots.forEach(function (shot, index) {
          const button = make('button', 'shotbutton');
          button.type = 'button';
          button.appendChild(make('span', '', String(index + 1).padStart(2, '0') + ' · ' + shot.title));
          button.appendChild(make('small', '', shot.kind + ' · ' + (shot.duration_ms / 1000) + 's'));
          button.addEventListener('click', function () {
            selectShot(index);
          });
          box.appendChild(button);
        });
        updateActive();
      };
      const loadFields = function () {
        if (!$('editor')) return;
        const shot = project.shots[selectedForm];
        if (!shot) return;
        $('etitle').value = shot.title || '';
        $('ebody').value = shot.body || '';
        $('ecaption').value = shot.caption || '';
        $('eduration').value = String(shot.duration_ms / 1000);
      };
      const setEditingDisabled = function (disabled) {
        ['etitle', 'ebody', 'ecaption', 'eduration', 'apply', 'save', 'file'].forEach(function (id) {
          const element = $(id);
          if (element) element.disabled = disabled;
        });
      };
      const applyForm = function (showMessage) {
        if (!$('editor')) return true;
        const candidate = clone(project);
        const shot = candidate.shots[selectedForm];
        if (!shot) return false;
        shot.title = $('etitle').value;
        shot.body = $('ebody').value;
        shot.caption = $('ecaption').value;
        const seconds = Number($('eduration').value);
        const duration = seconds * 1000;
        if (!Number.isFinite(seconds) || !Number.isInteger(duration) ||
            duration < 1000 || duration > 30000 || duration % 500 !== 0) {
          if (showMessage) fail('时长必须是 1–30 秒，且为 0.5 秒步进');
          return false;
        }
        shot.duration_ms = duration;
        try {
          validator(candidate);
        } catch (error) {
          if (showMessage) fail(error.message || String(error));
          return false;
        }
        project = candidate;
        updateMeta();
        if (showMessage) succeed('已应用更改');
        return true;
      };
      const checkOverflow = function (element, shot, field) {
        if (!element) return;
        if (element.scrollHeight > element.clientHeight + 1 ||
            element.scrollWidth > element.clientWidth + 1) {
          throw new Error('布局溢出 ' + shot.id + ' / ' + field +
            '：请缩短内容或调整分镜');
        }
      };
      const doubleRaf = function () {
        return new Promise(function (resolve) {
          requestAnimationFrame(function () {
            requestAnimationFrame(resolve);
          });
        });
      };
      const waitForFonts = function () {
        return document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
      };
      const fitStage = function () {
        const stagebox = $('stagebox');
        const stage = $('stage');
        if (!stagebox || !stage || !stagebox.clientWidth) return;
        const scale = stagebox.clientWidth / 1280;
        stage.style.transform = 'scale(' + scale + ')';
      };
      const setupStageFit = function () {
        const stagebox = $('stagebox');
        if (!stagebox) return;
        fitStage();
        if (typeof ResizeObserver !== 'undefined') {
          const observer = new ResizeObserver(function () { fitStage(); });
          observer.observe(stagebox);
        }
        window.addEventListener('resize', fitStage);
      };

      async function render(ms) {
        const token = ++renderToken;
        const duration = totalDuration();
        let time = Number(ms);
        if (!Number.isFinite(time)) time = 0;
        time = Math.max(0, Math.min(duration - 1, Math.floor(time)));
        const location = shotAt(time);
        const shot = project.shots[location.index];
        const stage = $('stage');
        if (!stage) throw new Error('预览舞台不存在');

        clear(stage);
        const content = make('div', 'content');
        stage.appendChild(content);

        const title = make('h1', '', shot.title);
        content.appendChild(title);
        if (shot.body) content.appendChild(make('div', 'body', shot.body));

        if (shot.kind === 'table') {
          const tableWrap = make('div', 'tablewrap');
          const table = make('table');
          const head = make('tr');
          shot.table.headers.forEach(function (header) {
            head.appendChild(make('th', '', header));
          });
          table.appendChild(head);
          shot.table.rows.forEach(function (row) {
            const tr = make('tr');
            row.forEach(function (cell) {
              tr.appendChild(make('td', '', cell));
            });
            table.appendChild(tr);
          });
          tableWrap.appendChild(table);
          if (shot.table.note) tableWrap.appendChild(make('div', 'note', shot.table.note));
          content.appendChild(tableWrap);
        }

        let image = null;
        if (shot.kind === 'image') {
          const imageWrap = make('div', 'imagewrap');
          image = make('img');
          image.alt = shot.image.note || shot.title;
          image.src = 'data:image/png;base64,' + shot.image.data;
          imageWrap.appendChild(image);
          content.appendChild(imageWrap);
          if (shot.image.note) content.appendChild(make('div', 'note', shot.image.note));
        }

        if (shot.source_refs && shot.source_refs.length) {
          const sources = make('div', 'sources');
          shot.source_refs.forEach(function (index) {
            const source = project.report.sources[index];
            if (!source) return;
            const row = make('div', 'source');
            row.appendChild(make('b', '', source.title));
            const publisher = source.publisher || '';
            const date = source.date || '';
            row.appendChild(make('div', 'publisher',
              publisher + (date ? (publisher ? ' · ' : '') + date : '')));
            row.appendChild(make('div', 'url', source.url));
            sources.appendChild(row);
          });
          content.appendChild(sources);
        }

        if (shot.caption) content.appendChild(make('div', 'caption', shot.caption));

        const footer = make('div', 'footer');
        footer.appendChild(make('span', '', project.report.version + ' · ' +
          (location.index + 1) + '/' + project.shots.length));
        footer.appendChild(make('span', '', project.report.title));
        stage.appendChild(footer);

        const progress = make('div', 'progress');
        const fill = make('i');
        fill.style.width = ((time + 1) / duration * 100) + '%';
        progress.appendChild(fill);
        stage.appendChild(progress);

        await waitForFonts();
        if (image) {
          try {
            await image.decode();
          } catch (error) {
            throw new Error('分镜 ' + shot.id + ' 的 PNG 图片无法解码：' +
              (error && error.message ? error.message : String(error)));
          }
        }
        await doubleRaf();
        if (token !== renderToken) return { shotId: shot.id, timeMs: time, stale: true };

        checkOverflow(content, shot, 'content');
        checkOverflow(title, shot, 'title');
        const body = content.querySelector('.body');
        checkOverflow(body, shot, 'body');
        const tableWrap = content.querySelector('.tablewrap');
        checkOverflow(tableWrap, shot, 'table');
        const imageWrap = content.querySelector('.imagewrap');
        checkOverflow(imageWrap, shot, 'image');
        content.querySelectorAll('.note').forEach(function (element) {
          checkOverflow(element, shot, 'note');
        });
        content.querySelectorAll('.source').forEach(function (element) {
          checkOverflow(element, shot, 'source');
        });
        checkOverflow(content.querySelector('.caption'), shot, 'caption');

        const contentRect = content.getBoundingClientRect();
        const footerRect = footer.getBoundingClientRect();
        if (contentRect.bottom > footerRect.top + 1) {
          throw new Error('布局溢出 ' + shot.id + ' / footer：正文与页脚重叠');
        }

        current = location.index;
        const seek = $('seek');
        if (seek) {
          seek.max = String(duration - 1);
          seek.value = String(time);
        }
        setText($('selected'), (current + 1) + ' / ' + project.shots.length + ' · ' + shot.title);
        updateActive();
        return { shotId: shot.id, timeMs: time, shotIndex: current, shotStart: location.start };
      }

      function selectShot(index) {
        if (playing || index < 0 || index >= project.shots.length) return false;
        if (!applyForm(true)) return false;
        selectedForm = index;
        loadFields();
        const location = shotAt(shotStart(index));
        render(location.start).catch(function (error) { fail(error); });
        return true;
      }
      function shotStart(index) {
        let start = 0;
        for (let i = 0; i < index; i += 1) start += project.shots[i].duration_ms;
        return start;
      }
      function stopPlayback() {
        playing = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        setEditingDisabled(false);
        const play = $('play');
        if (play) play.textContent = '播放 / Play';
        loadFields();
      }
      function startPlayback() {
        if (playing) {
          stopPlayback();
          return;
        }
        if (!applyForm(true)) return;
        const seek = $('seek');
        const offset = seek ? Number(seek.value) || 0 : 0;
        const target = shotAt(offset);
        selectedForm = target.index;
        loadFields();
        playing = true;
        setEditingDisabled(true);
        const play = $('play');
        if (play) play.textContent = '停止 / Stop';
        playbackOffset = offset;
        playbackStart = performance.now();

        const tick = async function (now) {
          if (!playing) return;
          const duration = totalDuration();
          const time = playbackOffset + now - playbackStart;
          if (time >= duration - 1) {
            try {
              await render(duration - 1);
            } catch (error) {
              fail(error);
            }
            stopPlayback();
            return;
          }
          try {
            await render(time);
          } catch (error) {
            fail(error);
            stopPlayback();
            return;
          }
          if (playing) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      }
      function saveProject() {
        if (!applyForm(true)) return;
        const blob = new Blob([JSON.stringify(project, null, 2)], {
          type: 'application/json'
        });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = 'project.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        succeed('已保存 JSON');
      }
      async function replaceProject(candidate) {
        const checkedCandidate = validator(candidate);
        const oldProject = project;
        const oldCurrent = current;
        const oldSelected = selectedForm;
        project = clone(checkedCandidate);
        current = 0;
        selectedForm = 0;
        try {
          updateMeta();
          updateList();
          loadFields();
          await render(0);
        } catch (error) {
          project = oldProject;
          current = oldCurrent;
          selectedForm = oldSelected;
          updateMeta();
          updateList();
          loadFields();
          try {
            await render(shotStart(oldCurrent));
          } catch (redrawError) {
            // Preserve the original load error if restoring the old frame fails.
          }
          throw error;
        }
      }

      function setup() {
        if (!$('editor')) return;
        updateMeta();
        updateList();
        loadFields();
        const seek = $('seek');
        seek.max = String(totalDuration() - 1);
        seek.addEventListener('input', function () {
          if (playing) return;
          if (!applyForm(true)) return;
          const time = Number(seek.value) || 0;
          const target = shotAt(time);
          selectedForm = target.index;
          loadFields();
          render(time).catch(function (error) { fail(error); });
        });
        $('play').addEventListener('click', startPlayback);
        $('apply').addEventListener('click', function () {
          if (applyForm(true)) render(shotStart(selectedForm)).catch(function (error) { fail(error); });
        });
        $('save').addEventListener('click', saveProject);
        $('file').addEventListener('change', async function (event) {
          const file = event.target.files && event.target.files[0];
          if (!file) return;
          if (file.size > 24 * 1024 * 1024) {
            fail('文件超过 24 MB');
            event.target.value = '';
            return;
          }
          try {
            const parsed = JSON.parse(await file.text());
            await replaceProject(parsed);
            succeed('项目已加载');
          } catch (error) {
            fail('加载失败：' + (error && error.message ? error.message : String(error)));
          }
          event.target.value = '';
        });
      }

      setupStageFit();
      setup();
      const readyPromise = render(0).then(function () { return undefined; });
      window.reportVideo = {
        ready: readyPromise,
        frame: function (ms) { return render(ms); },
        getProject: function () { return clone(project); },
        setProject: function (value) { return replaceProject(value); }
      };
    }());
  `;

  const controls = editor ? `
    <aside class="panel editor" id="editor">
      <div class="subhead">编辑当前分镜 / Edit shot</div>
      <label for="etitle">标题 / Title</label>
      <input id="etitle" type="text">
      <label for="ebody">正文 / Body</label>
      <textarea id="ebody"></textarea>
      <label for="ecaption">字幕 / Caption</label>
      <textarea id="ecaption"></textarea>
      <label for="eduration">时长（秒，0.5 步进）</label>
      <input id="eduration" type="number" min="1" max="30" step="0.5">
      <div class="actions">
        <button class="primary" id="apply" type="button">应用更改 / Apply</button>
        <button id="save" type="button">保存 JSON / Save</button>
        <label for="file" class="meta">加载 JSON / Load</label>
        <input id="file" type="file" accept="application/json,.json">
      </div>
      <div class="status" id="status" aria-live="polite"></div>
      <div class="hint">表格和图片可通过导出的 JSON 编辑；来源始终作为文字显示，不联网抓取。</div>
    </aside>
  ` : '';

  const shotList = editor ? `
    <aside class="panel">
      <div class="subhead">分镜 / Shots</div>
      <div id="shots" class="shots"></div>
    </aside>
  ` : '';

  const header = editor ? `
    <header class="top">
      <div>
        <div class="brand" id="project-title"></div>
        <div class="meta" id="project-meta"></div>
      </div>
      <div class="meta">离线预览 / Offline preview</div>
    </header>
  ` : '';

  const workspace = editor ? `
    <div class="workspace">
      ${shotList}
      <section class="viewer">
        <div class="stagebox" id="stagebox">
          <div class="stage" id="stage"></div>
        </div>
        <input class="seek" id="seek" type="range" min="0" max="${totalDuration - 1}" value="0" aria-label="播放位置">
        <div class="actions">
          <button class="play" id="play" type="button">播放 / Play</button>
          <span class="meta" id="selected"></span>
        </div>
      </section>
      ${controls}
    </div>
  ` : `
    <div class="workspace">
      <section class="viewer">
        <div class="stagebox" id="stagebox">
          <div class="stage" id="stage"></div>
        </div>
      </section>
    </div>
  `;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'">
  <title>${escapeHtml(checked.report.title)}</title>
  <style>${css}</style>
</head>
<body class="${editor ? 'editor-body' : 'viewer-only'}">
  <main class="app">
    ${header}
    ${workspace}
  </main>
  <script>${script}</script>
</body>
</html>`;
}

export { createPreviewHtml };
