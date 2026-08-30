import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { startServer } from '../server/index.mjs';

const cleanups = [];
afterEach(async () => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

test('production Server uses loopback and an OS-assigned port', async () => {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'redbook-server-'));
  const running = await startServer({ production: true, host: '0.0.0.0', port: 0, runtimeRoot });
  cleanups.push(async () => { await new Promise((resolve) => running.server.close(resolve)); await rm(runtimeRoot, { recursive: true, force: true }); });
  assert.equal(running.host, '127.0.0.1'); assert.ok(running.port > 0); assert.match(running.url, /^http:\/\/127\.0\.0\.1:\d+$/); assert.equal(running.server.address().address, '127.0.0.1');
  for (const endpoint of ['/api/account', '/api/discovery', '/api/opportunities']) assert.equal((await fetch(`${running.url}${endpoint}`)).status, 200);
  const account = await (await fetch(`${running.url}/api/account`)).json(); assert.equal(account.displayName, '');
  await fetch(`${running.url}/api/account`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName: 'runtime-test' }) });
  assert.match(await readFile(join(runtimeRoot, 'account.json'), 'utf8'), /runtime-test/);
});

test('production Server serves the built renderer', async () => {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'redbook-static-')); const running = await startServer({ production: true, port: 0, runtimeRoot });
  cleanups.push(async () => { await new Promise((resolve) => running.server.close(resolve)); await rm(runtimeRoot, { recursive: true, force: true }); });
  const response = await fetch(`${running.url}/`); assert.equal(response.status, 200); assert.match(await response.text(), /小红书 AI 内容运营工作台|root/);
});

test('electron build files exclude runtime data and include desktop server', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.ok(packageJson.build.files.includes('!data/**')); assert.ok(packageJson.build.files.includes('server/**/*')); assert.ok(packageJson.build.files.includes('desktop/**/*')); assert.ok(packageJson.build.files.includes('vendor/beav/xhs-collector/**/*')); assert.equal(packageJson.build.nsis.oneClick, false);
  assert.deepEqual(packageJson.build.extraResources, [{ from: 'vendor/beav/LICENSE', to: 'vendor/beav/LICENSE' }, { from: 'THIRD_PARTY_NOTICES.md', to: 'THIRD_PARTY_NOTICES.md' }]);
});
