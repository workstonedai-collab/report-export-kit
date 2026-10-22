// SPDX-License-Identifier: MIT
// Copyright 2026 workstonedai-collab
import { validateVideoProject } from './schema.js';

const plain = (value) => String(value)
  .replace(/\r\n?/g, '\n')
  .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
  .replace(/\n[ \t]*\n(?:[ \t]*\n)*/g, '\n');

const escapeMarkup = (value) => plain(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const stamp = (milliseconds) => {
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor(milliseconds % 3600000 / 60000);
  const seconds = Math.floor(milliseconds % 60000 / 1000);
  const remainder = milliseconds % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(remainder).padStart(3, '0')}`;
};

const vttStamp = (milliseconds) => stamp(milliseconds).replace(',', '.');

export function generateSubtitles(project) {
  const validated = validateVideoProject(project);
  let time = 0;
  let cueNumber = 0;
  const srtCues = [];
  const vttCues = [];

  for (const shot of validated.shots) {
    const start = time;
    const end = time + shot.duration_ms;
    time = end;
    const text = plain(shot.caption).trim();
    if (!text) continue;

    cueNumber += 1;
    const literalText = escapeMarkup(text);
    srtCues.push(`${cueNumber}\n${stamp(start)} --> ${stamp(end)}\n${literalText}\n`);
    vttCues.push(`${vttStamp(start)} --> ${vttStamp(end)}\n${literalText}\n`);
  }

  return {
    srt: srtCues.join('\n'),
    vtt: `WEBVTT\n\n${vttCues.join('\n')}`,
    duration_ms: time
  };
}

export function timeline(project) {
  const validated = validateVideoProject(project);
  let time = 0;
  return validated.shots.map((shot) => {
    const start = time;
    time += shot.duration_ms;
    return {
      id: shot.id,
      start_ms: start,
      end_ms: time
    };
  });
}
