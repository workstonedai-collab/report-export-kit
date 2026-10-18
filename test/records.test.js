import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { exportRecordWorkbook } from '../src/index.js';

test('long Unicode fields are split completely, version-bound and never formulas', async () => {
  const text = '中文😀\r\n'.repeat(8000), records = [{ id: '=EXAMPLE()', version: 2, source: 'https://example.org/version/2', fields: { 'a/b~c': text, formula: '=1+1', count: 4 } }];
  const before = JSON.stringify(records), result = await exportRecordWorkbook(records), zip = await JSZip.loadAsync(result.content);
  const detail = await zip.file('xl/worksheets/sheet2.xml').async('string');
  const chunks = [...detail.matchAll(/<c r="G\d+"[^>]*><is><t xml:space="preserve">([\s\S]*?)<\/t>/g)].slice(1).map(m => m[1].replace(/&#13;/g, '\r').replace(/&amp;/g, '&'));
  assert.equal(chunks.slice(0, -2).join(''), text);
  assert.ok(detail.includes('/a~1b~0c')); assert.ok(detail.includes('=1+1')); assert.ok(!detail.includes('<f>'));
  assert.equal(JSON.stringify(records), before); assert.equal(result.recordCount, 1);
  assert.deepEqual((await exportRecordWorkbook(records)).content, result.content);
});
test('rejects duplicate versions and invalid data without silently changing values', async () => {
  const row = { id: 'sample', version: 1, fields: { text: 'value' } };
  await assert.rejects(exportRecordWorkbook([row, row]), /Duplicate/);
  await assert.rejects(exportRecordWorkbook([{ ...row, fields: { bad: NaN } }]), /finite/);
  await assert.rejects(exportRecordWorkbook([{ ...row, fields: { bad: '\u0001' } }]), /XML/);
  await assert.rejects(exportRecordWorkbook([{ ...row, fields: { bad: '\ud800' } }]), /XML/);
});
