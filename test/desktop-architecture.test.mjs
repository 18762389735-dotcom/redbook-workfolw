import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { PARTITION } = require('../desktop/xhs-session.cjs');

test('XHS session uses the fixed persistent partition', () => {
  assert.equal(PARTITION, 'persist:redbook-xhs');
});

test('desktop preload exposes only the narrow collector surface', async () => {
  const source = await readFile(new URL('../desktop/preload.cjs', import.meta.url), 'utf8');
  assert.match(source, /contextBridge\.exposeInMainWorld/);
  assert.doesNotMatch(source, /require\(['"]node:(fs|path|child_process)['"]\)/);
  assert.doesNotMatch(source, /generic invoke|shell\.openExternal/);
});

test('XHS preload exposes the narrow bridge only in isolated world 9876', async () => {
  const source = await readFile(new URL('../desktop/xhs-preload.cjs', import.meta.url), 'utf8');
  assert.match(source, /contextBridge\.exposeInIsolatedWorld\(9876, 'redbookXhsBridge'/);
  assert.match(source, /ping\(\)/);
  assert.match(source, /sendCollectorMessage\(message\)/);
  assert.match(source, /confirmProfileClick\(payload\)/);
  assert.doesNotMatch(source, /contextBridge\.exposeInMainWorld/);
  assert.doesNotMatch(source, /window\.dispatchEvent\(new CustomEvent/);
});

test('XHS page transport uses the isolated bridge instead of CustomEvent RPC', async () => {
  const shim = require('../desktop/beav-extension-adapter.cjs').pageShimSource();
  const companion = await readFile(new URL('../desktop/redbook-xhs-overlay-companion.js', import.meta.url), 'utf8');
  assert.match(shim, /window\.redbookXhsBridge\.sendCollectorMessage/);
  assert.doesNotMatch(shim, /dispatchEvent\(new CustomEvent/);
  assert.match(companion, /redbookXhsBridge\.confirmProfileClick/);
  assert.doesNotMatch(companion, /redbook:xhs-overlay-profile-click/);
});
