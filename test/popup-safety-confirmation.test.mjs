import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('popup exposes the donor safety confirmation dialog', async () => {
  const html = await readFile(resolve(root, 'extension/beav-redbook/src/popup.html'), 'utf8');
  assert.match(html, /id="platform-safety-notice-dialog"/);
  assert.match(html, /id="platform-safety-notice-title"/);
  assert.match(html, /id="platform-safety-notice-description"/);
  assert.match(html, /value="cancel"/);
  assert.match(html, /我已登录小号，继续保存/);
});

test('popup gates the XHS save action with the existing background acknowledgement protocol', async () => {
  const source = await readFile(resolve(root, 'extension/beav-redbook/src/popup.js'), 'utf8');
  const runActionStart = source.indexOf('async function runAction(type)');
  const runActionEnd = source.indexOf('\n}\n\nfunction isXhsSaveAction', runActionStart);
  assert.ok(runActionStart >= 0 && runActionEnd > runActionStart);
  const runAction = source.slice(runActionStart, runActionEnd);

  assert.match(source, /function isXhsSaveAction\(type\)\s*\{\s*return String\(type \|\| ''\) === 'save-xhs';/);
  assert.match(runAction, /await ensurePlatformSaveSafetyNotice\(type\)/);
  assert.ok(runAction.indexOf('await ensurePlatformSaveSafetyNotice(type)') < runAction.indexOf('sendMessage({ type, tabId: activeTab.id })'));
  assert.match(source, /type: 'capture:platform-save-safety-notice:get'/);
  assert.match(source, /type: 'capture:platform-save-safety-notice:acknowledge'/);
  assert.match(source, /if \(!confirmed\)\s*\{[\s\S]*?return;/);
  assert.doesNotMatch(source, /acknowledgePlatformSaveSafetyNotice\([^)]*\)\s*;\s*\/\/\s*auto/);
});

test('popup confirmation uses a user-controlled dialog and preserves non-XHS actions', async () => {
  const [js, html] = await Promise.all([
    readFile(resolve(root, 'extension/beav-redbook/src/popup.js'), 'utf8'),
    readFile(resolve(root, 'extension/beav-redbook/src/popup.html'), 'utf8'),
  ]);
  assert.match(js, /platformSafetyNoticeDialog\.showModal\(\)/);
  assert.match(js, /window\.confirm\(/);
  assert.match(js, /showResult\('已取消保存', 'waiting'\)/);
  assert.match(html, /<button type="submit" value="cancel">暂不保存<\/button>/);
  assert.match(html, /id="platform-safety-notice-confirm"[^>]*value="confirm"/);
  assert.match(js, /if \(isXhsSaveAction\(type\)\)/);
});
