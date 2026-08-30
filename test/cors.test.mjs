import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { startServer } from '../server/index.mjs';

const cleanups = [];
afterEach(async () => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

async function running(options) {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'redbook-cors-'));
  const server = await startServer({ port: 0, runtimeRoot, ...options });
  cleanups.push(async () => { await new Promise((resolve) => server.server.close(resolve)); await rm(runtimeRoot, { recursive: true, force: true }); });
  return server;
}

test('same-origin account PUT and Node fetch succeed without CORS headers', async () => {
  const server = await running({ production: true });
  const response = await fetch(`${server.url}/api/account`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName: 'same-origin' }) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('production rejects evil preflight and never emits wildcard CORS', async () => {
  const server = await running({ production: true });
  const preflight = await fetch(`${server.url}/api/signals/ingest`, { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
  assert.equal(preflight.status, 403);
  assert.equal(preflight.headers.get('access-control-allow-origin'), null);
  const response = await fetch(`${server.url}/api/account`, { headers: { origin: 'https://evil.example' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.notEqual(response.headers.get('access-control-allow-origin'), '*');
});

test('dev allows only an explicitly configured extension origin', async () => {
  const server = await running({ production: false, allowedOrigins: ['chrome-extension://collector-test'] });
  const allowed = await fetch(`${server.url}/api/signals/ingest`, { method: 'OPTIONS', headers: { origin: 'chrome-extension://collector-test', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'chrome-extension://collector-test');
  const denied = await fetch(`${server.url}/api/signals/ingest`, { method: 'OPTIONS', headers: { origin: 'chrome-extension://other', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});
