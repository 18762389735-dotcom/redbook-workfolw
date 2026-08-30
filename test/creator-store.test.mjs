import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { CreatorStore } from '../core/creators/creator-store.mjs';
import { ingestCreators } from '../core/creators/ingest-creators.mjs';

const folders = [];
afterEach(async () => Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true }))));

async function createStore() {
  const folder = await mkdtemp(join(tmpdir(), 'creator-store-'));
  folders.push(folder);
  return new CreatorStore(join(folder, 'creators.json'));
}

const source = (taskId = 'creator-task-1') => ({ provider: 'beav-derived-browser-extension', method: 'creator-profile', taskId, capturedAt: '2026-08-30T00:00:00.000Z' });
const creator = (overrides = {}) => ({ userId: 'user-1', nickname: '真实博主', source: 'https://www.xiaohongshu.com/user/profile/user-1', stats: { fans: '1.2万', follows: '321', liked: '3万' }, capturedAt: '2026-08-30T00:00:00.000Z', ...overrides, source: overrides.source || source() });

test('Creator Snapshot ingests parsed metrics and reloads from its own store', async () => {
  const store = await createStore();
  const result = await ingestCreators(store, { creators: [creator({ profileUrl: 'https://www.xiaohongshu.com/user/profile/user-1', source: source() })] });
  assert.deepEqual(result, { received: 1, created: 1, updated: 0, duplicates: 0 });
  const reloaded = new CreatorStore(store.filePath);
  const [record] = await reloaded.list();
  assert.equal(record.metrics.followers, 12000);
  assert.equal(record.metrics.following, 321);
  assert.equal(record.metrics.likesAndCollects, 30000);
  assert.equal(record.profileUrl, 'https://www.xiaohongshu.com/user/profile/user-1');
});

test('unknown followers remain null', async () => {
  const store = await createStore();
  await ingestCreators(store, { creators: [creator({ stats: {}, source: source() })] });
  assert.equal((await store.list())[0].metrics.followers, null);
});

test('same creator updates in place without creating a second record', async () => {
  const store = await createStore();
  await ingestCreators(store, { creators: [creator({ source: source('task-1') })] });
  const result = await ingestCreators(store, { creators: [creator({ stats: { fans: '1.3万', follows: '321', liked: '3万' }, source: source('task-2') })] });
  assert.deepEqual(result, { received: 1, created: 0, updated: 1, duplicates: 0 });
  const records = await store.list();
  assert.equal(records.length, 1);
  assert.equal(records[0].metrics.followers, 13000);
});
