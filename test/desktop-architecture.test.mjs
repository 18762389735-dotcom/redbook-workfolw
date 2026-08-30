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
