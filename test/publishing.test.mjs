import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { PublishRecordStore } from '../core/publishing/publish-record-store.mjs';
import { createPublishingApiHandler } from '../server/publishing-api.mjs';
import { createServer } from 'node:http';

const folders = [];
afterEach(async () => Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true }))));
const input = { draftId: 'draft:1', opportunityId: 'opportunity:1', publishedUrl: 'https://www.xiaohongshu.com/explore/1', publishedAt: '2026-08-31T01:00:00.000Z', draftTitle: '真实标题', decisionStatus: 'OBSERVE' };

test('PublishRecordStore creates, updates metrics, and survives restart', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'publish-record-'));
  folders.push(folder);
  const path = join(folder, 'publish-records.json');
  const store = new PublishRecordStore(path);
  const created = await store.create(input);
  assert.equal(created.created, true);
  assert.equal((await store.create(input)).created, false);
  const updated = await store.update(created.record.id, { metrics24h: { views: 100, likes: 8, favorites: 2, comments: 1 }, notes: '人工复盘' });
  assert.equal(updated.metrics24h.views, 100);
  const reloaded = await new PublishRecordStore(path).get(created.record.id);
  assert.equal(reloaded.notes, '人工复盘');
  assert.equal(reloaded.platform, 'xhs');
});

test('publishing API exposes review records and manual updates', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'publish-api-'));
  folders.push(folder);
  const store = new PublishRecordStore(join(folder, 'publish-records.json'));
  const handler = createPublishingApiHandler({ publishRecordStore: store });
  const server = createServer((request, response) => handler(request, response));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const created = await fetch(`${baseUrl}/api/publish-records`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
    assert.equal(created.status, 201);
    const record = (await created.json()).record;
    const updated = await fetch(`${baseUrl}/api/publish-records/${record.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ metrics72h: { views: 200 } }) });
    assert.equal((await updated.json()).record.metrics72h.views, 200);
    const review = await fetch(`${baseUrl}/api/review`);
    assert.equal((await review.json()).records.length, 1);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
