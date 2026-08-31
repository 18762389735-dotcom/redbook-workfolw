import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, test } from 'node:test';
import { createBeavConnector, startBeavConnector, BEAV_CONNECTOR_HEADER, BEAV_CONNECTOR_PORT } from '../server/beav-connector.mjs';
import { ingestSignals as ingestSignalBatch } from '../core/signals/ingest-signals.mjs';
import { ingestCreators as ingestCreatorBatch } from '../core/creators/ingest-creators.mjs';
import { SignalStore } from '../core/signals/signal-store.mjs';
import { CreatorStore } from '../core/creators/creator-store.mjs';
import { readFile } from 'node:fs/promises';
import { startServer } from '../server/index.mjs';
import { fileURLToPath } from 'node:url';
import { APP_VERSION, BUILD_COMMIT } from '../server/build-info.mjs';

const cleanups = [];
afterEach(async () => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

function headers(origin = '') {
  return {
    ...(origin ? { Origin: origin } : {}),
    'X-Redbook-Connector': BEAV_CONNECTOR_HEADER,
  };
}

async function startTestConnector() {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'redbook-beav-connector-'));
  const signalStore = new SignalStore(join(runtimeRoot, 'signals.json'));
  const creatorStore = new CreatorStore(join(runtimeRoot, 'creators.json'));
  const connector = createBeavConnector({
    port: BEAV_CONNECTOR_PORT,
    ingestSignals: (payload) => ingestSignalBatch(signalStore, payload),
    ingestCreators: (payload) => ingestCreatorBatch(creatorStore, payload),
  });
  await connector.listen();
  cleanups.push(async () => { await connector.close(); await rm(runtimeRoot, { recursive: true, force: true }); });
  return { connector, signalStore, creatorStore, runtimeRoot, url: `http://127.0.0.1:${BEAV_CONNECTOR_PORT}` };
}

const notePayload = {
  noteId: 'note-connector-1',
  source: 'https://www.xiaohongshu.com/explore/note-connector-1?xsec_token=do-not-store',
  title: '真实结构笔记',
  content: '公开正文',
  author: '作者',
  authorId: 'creator-1',
  authorProfileUrl: 'https://www.xiaohongshu.com/user/profile/creator-1?xsec_token=discard',
  stats: { likes: '1.2万', collects: '3万', comments: '856赞' },
};

test('connector health is loopback-only and returns the stable contract', async () => {
  const { url } = await startTestConnector();
  const response = await fetch(`${url}/health`, { headers: headers('chrome-extension://abcdefghijklmnop') });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    service: 'redbook-beav-connector',
    version: 1,
    appVersion: APP_VERSION,
    buildCommit: BUILD_COMMIT,
  });
  assert.equal(response.headers.get('access-control-allow-origin'), 'chrome-extension://abcdefghijklmnop');
});

test('connector ingests donor note and creator payloads through Redbook adapters', async () => {
  const { url, signalStore, creatorStore } = await startTestConnector();
  const noteResponse = await fetch(`${url}/v1/xhs/note`, { method: 'POST', headers: { ...headers(), 'content-type': 'application/json' }, body: JSON.stringify({ payload: notePayload, __redbook: { method: 'current-note', taskId: 'native-task-1', capturedAt: '2026-08-31T03:00:00.000Z' } }) });
  assert.equal(noteResponse.status, 200);
  const noteResult = await noteResponse.json();
  assert.equal(noteResult.created, 1);
  assert.equal(noteResult.authorId, 'creator-1');
  const signal = (await signalStore.list())[0];
  assert.equal(signal.noteId, 'note-connector-1');
  assert.equal(signal.metrics.likes, 12000);
  assert.equal(signal.url, 'https://www.xiaohongshu.com/explore/note-connector-1');
  assert.equal(signal.source.taskId, 'native-task-1');
  assert.equal(signal.capturedAt, '2026-08-31T03:00:00.000Z');

  const creatorResponse = await fetch(`${url}/v1/xhs/creator`, { method: 'POST', headers: { ...headers(), 'content-type': 'application/json' }, body: JSON.stringify({ userId: 'creator-1', nickname: '作者', source: 'https://www.xiaohongshu.com/user/profile/creator-1?xsec_token=discard', stats: { fans: '1,234', follows: '56' } }) });
  assert.equal(creatorResponse.status, 200);
  assert.equal((await creatorResponse.json()).created, 1);
  const creator = (await creatorStore.list())[0];
  assert.equal(creator.userId, 'creator-1');
  assert.equal(creator.profileUrl, 'https://www.xiaohongshu.com/user/profile/creator-1');
  assert.equal(creator.metrics.followers, 1234);
});

test('connector batch preserves one task provenance and skips invalid donor records without fake data', async () => {
  const { url, signalStore } = await startTestConnector();
  const response = await fetch(`${url}/v1/xhs/notes`, { method: 'POST', headers: { ...headers(), 'content-type': 'application/json' }, body: JSON.stringify({ notes: [notePayload, { title: 'invalid' }] }) });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.requested, 2);
  assert.equal(result.received, 1);
  assert.equal(result.errors.length, 1);
  const signals = await signalStore.list();
  assert.equal(signals.length, 1);
  assert.equal(signals[0].source.method, 'creator-baseline');
  assert.equal(signals[0].source.taskId, signals[0].observations[0].taskId);
});

test('connector rejects evil origins, missing discriminator, wrong content type, and unknown routes', async () => {
  const { url, signalStore } = await startTestConnector();
  const evil = await fetch(`${url}/v1/xhs/note`, { method: 'POST', headers: { Origin: 'https://xiaohongshu.com', 'content-type': 'application/json', 'X-Redbook-Connector': BEAV_CONNECTOR_HEADER }, body: JSON.stringify(notePayload) });
  assert.equal(evil.status, 403);
  const missing = await fetch(`${url}/v1/xhs/note`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(notePayload) });
  assert.equal(missing.status, 403);
  const wrongType = await fetch(`${url}/v1/xhs/note`, { method: 'POST', headers: { ...headers(), 'content-type': 'text/plain' }, body: JSON.stringify(notePayload) });
  assert.equal(wrongType.status, 415);
  const unknown = await fetch(`${url}/v1/raw`, { method: 'POST', headers: { ...headers(), 'content-type': 'application/json' }, body: '{}' });
  assert.equal(unknown.status, 404);
  assert.equal((await signalStore.list()).length, 0);
});

test('connector accepts an extension preflight only when the typed header is requested', async () => {
  const { url } = await startTestConnector();
  const allowed = await fetch(`${url}/v1/xhs/note`, { method: 'OPTIONS', headers: { Origin: 'chrome-extension://abcdefghijklmnop', 'Access-Control-Request-Headers': 'content-type, x-redbook-connector', 'Access-Control-Request-Method': 'POST' } });
  assert.equal(allowed.status, 204);
  const denied = await fetch(`${url}/v1/xhs/note`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Headers': 'content-type, x-redbook-connector', 'Access-Control-Request-Method': 'POST' } });
  assert.equal(denied.status, 403);
});

test('connector forwards normalized donor payloads into the running Workbench API', async () => {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'redbook-beav-integration-'));
  const running = await startServer({ production: true, port: 0, runtimeRoot });
  const connector = await startBeavConnector({ apiBaseUrl: running.url, port: BEAV_CONNECTOR_PORT });
  cleanups.push(async () => {
    await connector.close();
    running.server.closeAllConnections?.();
    await new Promise((resolve, reject) => running.server.close((error) => error ? reject(error) : resolve()));
    await rm(runtimeRoot, { recursive: true, force: true });
  });
  const result = await connector.ingestNote(notePayload);
  assert.equal(result.success, true);
  const response = await fetch(`${running.url}/api/signals`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.signals.length, 1);
  assert.equal(body.signals[0].noteId, notePayload.noteId);
});

test('Redbook extension copy is packaged separately from the vendor tree', async () => {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const manifest = JSON.parse(await readFile(join(root, 'extension', 'beav-redbook', 'src', 'manifest.json'), 'utf8'));
  assert.equal(manifest.background.type, 'module');
  assert.equal(manifest.name, '小红书采集助手');
  assert.equal(await readFile(join(root, 'extension', 'beav-redbook', 'src', 'redbookConnector.js'), 'utf8').then((text) => text.includes('127.0.0.1:43127')), true);
  const background = await readFile(join(root, 'extension', 'beav-redbook', 'src', 'background.js'), 'utf8');
  assert.match(background, /forwardToRedbook\('note'/);
  assert.match(background, /forwardToRedbook\('creator'/);
  const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.ok(packageJson.build.files.includes('extension/beav-redbook/src/**/*'));
  assert.ok(!packageJson.build.files.includes('extension/beav-redbook/**/*'));
});
