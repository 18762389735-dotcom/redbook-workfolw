import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ElectronCollector } = require('../desktop/electron-collector.cjs');
const { executePageFunction } = require('../desktop/page-execution.cjs');

function evaluatingContents() {
  return {
    async executeJavaScript(script) {
      return vm.runInNewContext(script, {});
    },
  };
}

test('page function errors preserve a sanitized page-function diagnostic', async () => {
  await assert.rejects(
    () => executePageFunction(evaluatingContents(), () => { throw new TypeError('creator extraction test failure'); }, [], 'creator-profile'),
    (error) => error.stage === 'page-function'
      && /TypeError/.test(error.message)
      && /creator extraction test failure/.test(error.message),
  );
});

test('Electron execution rejections preserve the electron-execute diagnostic', async () => {
  const contents = { executeJavaScript: async () => { throw new Error('Script failed to execute'); } };
  await assert.rejects(
    () => executePageFunction(contents, () => ({ ok: true }), [], 'creator-profile'),
    (error) => error.stage === 'electron-execute' && /Script failed to execute/.test(error.message),
  );
});

test('page execution preserves sync and async successful payloads', async () => {
  assert.equal(JSON.stringify(await executePageFunction(evaluatingContents(), () => ({ userId: 'test-user' }), [], 'creator-profile')), JSON.stringify({ userId: 'test-user' }));
  assert.equal(await executePageFunction(evaluatingContents(), async () => 'async-ok', [], 'creator-profile'), 'async-ok');
  await assert.rejects(
    () => executePageFunction(evaluatingContents(), async () => { throw new Error('async failure'); }, [], 'creator-profile'),
    /page-function.*async failure/i,
  );
});

test('page diagnostics redact token-bearing URLs and token-like fields', async () => {
  const contents = {
    async executeJavaScript() {
      return { ok: false, error: { name: 'Error', message: 'https://www.xiaohongshu.com/user/profile/a?xsec_token=DO_NOT_LEAK token=DO_NOT_LEAK' } };
    },
  };
  await assert.rejects(
    () => executePageFunction(contents, () => null, [], 'creator-profile'),
    (error) => !error.message.includes('DO_NOT_LEAK') && error.message.includes('[URL REDACTED]'),
  );
});

test('creator page failure marks its task failed without calling creator ingest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'redbook-page-diagnostic-'));
  let postCalls = 0;
  const window = {
    isDestroyed: () => false,
    webContents: { isDestroyed: () => false, getURL: () => 'https://www.xiaohongshu.com/explore/live-profile' },
  };
  const collector = new ElectronCollector({ xhsSession: { getWindow: () => window }, serverUrl: 'http://127.0.0.1:30001', runtimeRoot: root });
  collector.page = async () => { throw new Error('Page script failed [creator-profile/page-function]: TypeError: test failure'); };
  collector.post = async () => { postCalls += 1; };
  try {
    await assert.rejects(() => collector.collectCreator(), /creator-profile\/page-function/);
    const [task] = await collector.listTasks();
    assert.equal(task.status, 'failed');
    assert.match(task.error, /creator-profile\/page-function/);
    assert.equal(postCalls, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
