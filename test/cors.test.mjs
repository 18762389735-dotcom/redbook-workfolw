import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { startServer } from '../server/index.mjs';

const cleanups = [];
const EVIL_ORIGIN = 'https://evil.example';

afterEach(async () => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

async function running(options = {}) {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'redbook-cors-'));
  const server = await startServer({ port: 0, runtimeRoot, ...options });
  cleanups.push(async () => {
    await new Promise((resolve) => server.server.close(resolve));
    await rm(runtimeRoot, { recursive: true, force: true });
  });
  return { ...server, runtimeRoot };
}

function signalPayload(noteId = 'cors-note-1') {
  return {
    signals: [{
      id: `xiaohongshu:${noteId}`,
      platform: 'xiaohongshu',
      noteId,
      url: `https://www.xiaohongshu.com/explore/${noteId}`,
      title: '边界测试笔记',
      bodyText: '仅用于 API 边界回归测试',
      author: { id: 'author-1', name: '测试作者', profileUrl: null, followerCount: 10 },
      metrics: { likes: 1, favorites: 2, comments: 3, shares: 4 },
      media: { cover: null, images: [], type: 'image' },
      publishedAt: '2026-08-30T10:00:00.000Z',
      capturedAt: '2026-08-30T10:01:00.000Z',
      source: { provider: 'test', method: 'visible-notes', keyword: null, taskId: 'cors-task-1' },
    }],
  };
}

async function listSignals(server) {
  const response = await fetch(`${server.url}/api/signals`);
  assert.equal(response.status, 200);
  return (await response.json()).signals;
}

test('same-origin GET and PUT succeed against the dynamic production origin', async () => {
  const server = await running({ production: true });
  const getResponse = await fetch(`${server.url}/api/account`, { headers: { origin: server.url } });
  assert.equal(getResponse.status, 200);
  assert.equal(getResponse.headers.get('access-control-allow-origin'), server.url);
  const putResponse = await fetch(`${server.url}/api/account`, {
    method: 'PUT',
    headers: { origin: server.url, 'content-type': 'application/json' },
    body: JSON.stringify({ displayName: 'same-origin' }),
  });
  assert.equal(putResponse.status, 200);
});

test('Node fetch without Origin remains allowed for the Electron main process', async () => {
  const server = await running({ production: true });
  const response = await fetch(`${server.url}/api/signals/ingest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(signalPayload()),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: 1, created: 1, updated: 0, duplicates: 0 });
});

test('production rejects evil GET before the API handler and never emits wildcard CORS', async () => {
  const server = await running({ production: true });
  const preflight = await fetch(`${server.url}/api/signals/ingest`, {
    method: 'OPTIONS',
    headers: { origin: EVIL_ORIGIN, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' },
  });
  assert.equal(preflight.status, 403);
  assert.equal(preflight.headers.get('access-control-allow-origin'), null);
  const response = await fetch(`${server.url}/api/signals`, { headers: { origin: EVIL_ORIGIN } });
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.notEqual(response.headers.get('access-control-allow-origin'), '*');
});

test('evil simple POST cannot ingest signals or change store contents', async () => {
  const server = await running({ production: true });
  const before = await listSignals(server);
  const response = await fetch(`${server.url}/api/signals/ingest`, {
    method: 'POST',
    headers: { origin: EVIL_ORIGIN, 'content-type': 'text/plain' },
    body: JSON.stringify(signalPayload('evil-note')),
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await listSignals(server), before);
});

test('evil opportunity action is rejected without changing opportunity state', async () => {
  const server = await running({ production: true });
  const path = join(server.runtimeRoot, 'opportunities.json');
  const initial = JSON.stringify({ version: 1, states: { 'cluster-1': { state: 'active' } } }, null, 2);
  await writeFile(path, initial, 'utf8');
  const response = await fetch(`${server.url}/api/opportunities/cluster-1/action`, {
    method: 'POST',
    headers: { origin: EVIL_ORIGIN, 'content-type': 'text/plain' },
    body: JSON.stringify({ action: 'save' }),
  });
  assert.equal(response.status, 403);
  assert.equal(await readFile(path, 'utf8'), initial);
});

test('evil creator ingest is rejected without changing creator store', async () => {
  const server = await running({ production: true });
  const path = join(server.runtimeRoot, 'creators.json');
  const initial = JSON.stringify({ version: 1, creators: [] }, null, 2);
  await writeFile(path, initial, 'utf8');
  const response = await fetch(`${server.url}/api/creators/ingest`, {
    method: 'POST',
    headers: { origin: EVIL_ORIGIN, 'content-type': 'text/plain' },
    body: JSON.stringify({ creators: [{ userId: 'evil', nickname: '不应写入' }] }),
  });
  assert.equal(response.status, 403);
  assert.equal(await readFile(path, 'utf8'), initial);
});

test('development allows an explicitly configured extension origin for real requests', async () => {
  const server = await running({ production: false, allowedOrigins: ['chrome-extension://collector-test'] });
  const allowed = await fetch(`${server.url}/api/signals`, { headers: { origin: 'chrome-extension://collector-test' } });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'chrome-extension://collector-test');
  const denied = await fetch(`${server.url}/api/signals`, { headers: { origin: 'chrome-extension://other' } });
  assert.equal(denied.status, 403);
});

test('production responses never contain wildcard CORS headers', async () => {
  const server = await running({ production: true });
  const response = await fetch(`${server.url}/api/account`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.notEqual(response.headers.get('access-control-allow-origin'), '*');
});

test('production rejects an incorrect Host header', async () => {
  const server = await running({ production: true });
  const response = await new Promise((resolve, reject) => {
    const request = httpRequest(`${server.url}/api/account`, { headers: { host: 'evil.example' } }, (incoming) => {
      incoming.resume();
      incoming.once('end', () => resolve(incoming));
    });
    request.once('error', reject);
    request.end();
  });
  assert.equal(response.statusCode, 403);
  assert.equal(response.headers['access-control-allow-origin'], undefined);
});
