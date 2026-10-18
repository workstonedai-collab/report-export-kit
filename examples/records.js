import fs from 'node:fs/promises';
import { exportRecordWorkbook } from '../src/index.js';
const records = [{ id: 'fictional-note', version: 2, source: 'https://example.org/notes/2', fields: { title: '虚构示例 / Fictional example', body: 'A long source-bound note. 中文示例。\n'.repeat(2000), literal: '=THIS_IS_TEXT()' } }];
const result = await exportRecordWorkbook(records);
await fs.mkdir('output', { recursive: true });
await fs.writeFile('output/records.xlsx', result.content);
console.log(JSON.stringify({ records: result.recordCount, parts: result.fieldPartCount, sha256: result.sha256 }));
