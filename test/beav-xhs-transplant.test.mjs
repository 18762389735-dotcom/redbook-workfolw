import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { normalizeXiaohongshuSignal } from '../providers/xiaohongshu/normalize.mjs';
import { normalizeXiaohongshuCreator } from '../providers/xiaohongshu/normalize-creator.mjs';
import { beavNotePayloadToSignalInput, beavCreatorPayloadToCreatorInput } from '../vendor/beav/plugin-xhs/redbook-payload-adapter.js';
import { allowedCollectorMessage, COLLECTOR_MESSAGE_TYPES, pageShimSource } from '../desktop/beav-extension-adapter.cjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const pluginRoot = resolve(root, 'vendor/beav/plugin-xhs');

test('Beav byte-identical files match the recorded donor hashes', async () => {
  const manifest = JSON.parse(await readFile(resolve(pluginRoot, 'SOURCE_MANIFEST.json'), 'utf8'));
  for (const entry of manifest.files.filter((item) => item.mode === 'byte-identical')) {
    const bytes = await readFile(resolve(pluginRoot, entry.targetPath));
    const actual = createHash('sha256').update(bytes).digest('hex').toUpperCase();
    assert.equal(actual, entry.donorSha256, entry.targetPath);
  }
});

test('Beav-shaped current-note payload becomes one normalized Signal without DOM re-parsing', () => {
  const source = { provider: 'beav-derived-electron-session', method: 'visible-notes', taskId: 'task-note', capturedAt: '2026-08-31T00:00:00.000Z' };
  const input = beavNotePayloadToSignalInput({
    noteId: '66af00000000000001234567', source: 'https://www.xiaohongshu.com/explore/66af00000000000001234567?xsec_token=discard', title: '真实结构笔记', content: '正文', author: '作者', authorId: 'user-1', authorProfileUrl: 'https://www.xiaohongshu.com/user/profile/user-1', coverUrl: 'https://ci.xiaohongshu.com/cover.jpg', images: ['https://ci.xiaohongshu.com/a.jpg'], noteType: 'image', stats: { likes: 123, collects: 45 },
  }, source);
  const signal = normalizeXiaohongshuSignal(input, source);
  assert.equal(signal.noteId, '66af00000000000001234567');
  assert.equal(signal.title, '真实结构笔记');
  assert.equal(signal.author.id, 'user-1');
  assert.equal(signal.metrics.likes, 123);
  assert.equal(signal.source.provider, 'beav-derived-electron-session');
  assert.equal(signal.url, 'https://www.xiaohongshu.com/explore/66af00000000000001234567');
});

test('Beav-shaped creator payload requires donor-derived canonical userId', () => {
  const source = { provider: 'beav-derived-electron-session', method: 'creator-profile', taskId: 'task-creator', capturedAt: '2026-08-31T00:00:00.000Z' };
  const input = beavCreatorPayloadToCreatorInput({ userId: '6510fac50000000012005c53', nickname: 'is涵', stats: { fans: '1836', follows: 942, liked: '4.2万' }, source: 'https://www.xiaohongshu.com/search_result_ai' }, source);
  const creator = normalizeXiaohongshuCreator(input, source);
  assert.equal(creator.userId, '6510fac50000000012005c53');
  assert.equal(creator.profileUrl, 'https://www.xiaohongshu.com/user/profile/6510fac50000000012005c53');
  assert.equal(creator.metrics.followers, 1836);
  assert.equal(creator.metrics.likesAndCollects, 42000);
  assert.throws(() => beavCreatorPayloadToCreatorInput({ nickname: 'is涵' }, source), /canonical platform userId/);
});

test('Electron Beav shim has a fixed collector message allowlist and no generic invoke surface', async () => {
  assert.deepEqual(COLLECTOR_MESSAGE_TYPES, ['save-xhs', 'xhs:collect-current-blogger']);
  assert.equal(allowedCollectorMessage({ type: 'save-xhs' }), true);
  assert.equal(allowedCollectorMessage({ type: 'xhs:collect-current-blogger' }), true);
  assert.equal(allowedCollectorMessage({ type: 'xhs:collect-blogger-notes' }), false);
  assert.equal(allowedCollectorMessage({ type: 'fs:read' }), false);
  const shim = pageShimSource();
  assert.doesNotMatch(shim, /\b(?:require|child_process|ipcRenderer|process)\b/);
  assert.doesNotMatch(shim, /invoke\s*\(/);
  const observer = await readFile(resolve(pluginRoot, 'pageObserver.js'), 'utf8');
  assert.match(observer, /type:\s*'save-xhs'/);
  assert.match(observer, /type:\s*'xhs:collect-current-blogger'/);
  assert.match(observer, /const ACCOUNT_BINDING_FEATURE_ENABLED = false/);
  assert.match(observer, /function isXhsProfilePath/);
});
