import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { CreatorStore } from '../core/creators/creator-store.mjs';
import { SignalStore } from '../core/signals/signal-store.mjs';
import { createCreatorsApiHandler } from '../server/creators-api.mjs';
import { createDiscoveryApiHandler } from '../server/discovery-api.mjs';

const cleanups = [];
afterEach(async () => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

async function fixture() {
  const folder = await mkdtemp(join(tmpdir(), 'discovery-api-'));
  const signals = new SignalStore(join(folder, 'signals.json'));
  const creators = new CreatorStore(join(folder, 'creators.json'));
  const creatorApi = createCreatorsApiHandler(creators);
  const discoveryApi = createDiscoveryApiHandler(signals, creators);
  const server = createServer((request, response) => request.url.startsWith('/api/creators') ? creatorApi(request, response) : discoveryApi(request, response));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(async () => { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); await rm(folder, { recursive: true, force: true }); });
  return { baseUrl: `http://127.0.0.1:${server.address().port}`, creators };
}

test('Creator API ingests, lists, and gets a snapshot without inventing missing followers', async () => {
  const { baseUrl } = await fixture();
  const response = await fetch(`${baseUrl}/api/creators/ingest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ creators: [{ userId: 'author-api', nickname: '真实作者', source: { provider: 'test', method: 'creator-profile', taskId: 'creator-task', capturedAt: '2026-08-30T08:00:00.000Z' } }] }) });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: 1, created: 1, updated: 0, duplicates: 0 });
  const list = await (await fetch(`${baseUrl}/api/creators`)).json();
  assert.equal(list.creators[0].metrics.followers, null);
  const item = await (await fetch(`${baseUrl}/api/creators/${encodeURIComponent(list.creators[0].id)}`)).json();
  assert.equal(item.userId, 'author-api');
});

test('Discovery API is realtime and exposes only platform-layer fit status', async () => {
  const { baseUrl } = await fixture();
  const payload = await (await fetch(`${baseUrl}/api/discovery`)).json();
  assert.ok(payload.generatedAt);
  assert.deepEqual(payload.outliers, []);
  assert.deepEqual(payload.clusters, []);
  assert.ok(payload.limitations.some((item) => item.includes('未评估账号适配')));
});
