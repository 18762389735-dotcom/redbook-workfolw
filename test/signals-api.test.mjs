import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { SignalStore } from '../core/signals/signal-store.mjs';
import { createSignalsApiHandler } from '../server/signals-api.mjs';

const cleanups = [];
afterEach(async () => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

async function apiFixture() {
  const folder = await mkdtemp(join(tmpdir(), 'signals-api-'));
  const store = new SignalStore(join(folder, 'signals.json'));
  const server = createServer(createSignalsApiHandler(store));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  cleanups.push(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(folder, { recursive: true, force: true });
  });
  return `http://127.0.0.1:${port}`;
}

test('GET /api/signals exposes latest collector batch metadata', async () => {
  const baseUrl = await apiFixture();
  const signals = ['note-1', 'note-2'].map((noteId) => ({
    note_id: noteId,
    title: `笔记 ${noteId}`,
    liked_count: '1.2万',
    source: { provider: 'beav-derived-browser-extension', method: 'visible-notes', taskId: 'task-latest', capturedAt: '2026-08-30T03:00:00.000Z' },
  }));
  const ingestResponse = await fetch(`${baseUrl}/api/signals/ingest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ signals }) });
  assert.equal(ingestResponse.status, 200);

  const response = await fetch(`${baseUrl}/api/signals`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.latestTaskId, 'task-latest');
  assert.equal(payload.latestCapturedAt, '2026-08-30T03:00:00.000Z');
  assert.equal(payload.signals.length, 2);
  assert.ok(payload.signals.every((signal) => signal.source.taskId === payload.latestTaskId));
  assert.ok(payload.signals.every((signal) => signal.metrics.likes === 12000));
});
