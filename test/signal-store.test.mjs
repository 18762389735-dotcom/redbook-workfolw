import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SignalStore } from '../core/signals/signal-store.mjs';
import { ingestSignals } from '../core/signals/ingest-signals.mjs';
import { normalizeXiaohongshuSignal, parseMetric } from '../providers/xiaohongshu/normalize.mjs';

const folders = [];
afterEach(async () => Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true }))));

async function createStore() {
  const folder = await mkdtemp(join(tmpdir(), 'signal-store-'));
  folders.push(folder);
  return new SignalStore(join(folder, 'signals.json'));
}

function source(taskId, capturedAt, overrides = {}) {
  return { provider: 'beav-derived-browser-extension', method: 'visible-notes', keyword: null, taskId, capturedAt, ...overrides };
}

function rawSignal(overrides = {}) {
  return {
    note_id: 'note-1',
    title: '真实响应字段示例',
    user: { user_id: 'u-1', nickname: '作者' },
    liked_count: 12,
    source: source('task-1', '2026-08-30T00:00:00.000Z'),
    ...overrides,
  };
}

test('same facts with a different taskId are duplicate and keep latest provenance', async () => {
  const store = await createStore();
  await ingestSignals(store, { signals: [rawSignal()] });
  const latestSource = source('task-2', '2026-08-30T01:00:00.000Z', { method: 'current-note', keyword: '新 provenance' });
  const result = await ingestSignals(store, { signals: [rawSignal({ source: latestSource })] });

  assert.deepEqual(result, { received: 1, created: 0, updated: 0, duplicates: 1 });
  const [record] = await store.list();
  assert.equal(record.source.taskId, 'task-2');
  assert.equal(record.source.method, 'current-note');
  assert.equal(record.source.keyword, '新 provenance');
  assert.equal(record.capturedAt, '2026-08-30T01:00:00.000Z');
});

test('a changed platform metric is updated and survives store reload', async () => {
  const store = await createStore();
  await ingestSignals(store, { signals: [rawSignal()] });
  const result = await ingestSignals(store, { signals: [rawSignal({ liked_count: 13, source: source('task-2', '2026-08-30T01:00:00.000Z') })] });

  assert.deepEqual(result, { received: 1, created: 0, updated: 1, duplicates: 0 });
  const reloaded = new SignalStore(store.filePath);
  const [record] = await reloaded.list();
  assert.equal(record.metrics.likes, 13);
  assert.equal(record.source.taskId, 'task-2');
});

test('parseMetric accepts only explicit numeric formats', () => {
  assert.equal(parseMetric(123), 123);
  assert.equal(parseMetric('123'), 123);
  assert.equal(parseMetric('1,234'), 1234);
  assert.equal(parseMetric('1.2万'), 12000);
  assert.equal(parseMetric('3万'), 30000);
  assert.equal(parseMetric('1.5千'), 1500);
  assert.equal(parseMetric('856赞'), 856);
  assert.equal(parseMetric(null), null);
  assert.equal(parseMetric(''), null);
  assert.equal(parseMetric('暂无'), null);
  assert.equal(parseMetric('约一万'), null);
  assert.equal(parseMetric('12,34'), null);
  assert.equal(parseMetric('-1'), null);
});

test('normalizer parses string metrics and followerCount', () => {
  const signal = normalizeXiaohongshuSignal(rawSignal({
    liked_count: '1.2万',
    collected_count: '1,234',
    comment_count: '856赞',
    share_count: '暂无',
    user: { user_id: 'u-1', nickname: '作者', follower_count: '1.5千' },
  }), source('task-1', '2026-08-30T00:00:00.000Z'));

  assert.deepEqual(signal.metrics, { likes: 12000, favorites: 1234, comments: 856, shares: null });
  assert.equal(signal.author.followerCount, 1500);
});

test('normalizer reads the observed XHS interact_info string structure', () => {
  const signal = normalizeXiaohongshuSignal(rawSignal({
    liked_count: undefined,
    interact_info: { liked_count: '2204', collected_count: '575', comment_count: '152', share_count: '121' },
  }), source('task-observed', '2026-08-30T10:00:00.000Z'));

  assert.deepEqual(signal.metrics, { likes: 2204, favorites: 575, comments: 152, shares: 121 });
});

test('latest task metadata identifies every record touched by the newest batch', async () => {
  const store = await createStore();
  await ingestSignals(store, { signals: [
    rawSignal({ note_id: 'old-note', source: source('task-1', '2026-08-30T00:00:00.000Z') }),
    rawSignal({ note_id: 'note-1', source: source('task-1', '2026-08-30T00:00:00.000Z') }),
  ] });
  await ingestSignals(store, { signals: [
    rawSignal({ note_id: 'note-1', source: source('task-2', '2026-08-30T02:00:00.000Z') }),
    rawSignal({ note_id: 'note-2', source: source('task-2', '2026-08-30T02:00:00.000Z') }),
  ] });

  const snapshot = await store.listWithMetadata();
  assert.equal(snapshot.latestTaskId, 'task-2');
  assert.equal(snapshot.latestCapturedAt, '2026-08-30T02:00:00.000Z');
  assert.deepEqual(snapshot.signals.filter((signal) => signal.source.taskId === snapshot.latestTaskId).map((signal) => signal.noteId).sort(), ['note-1', 'note-2']);
  assert.equal(snapshot.signals.length, 3);
});

test('preserves only a collector-provided source URL', async () => {
  const store = await createStore();
  const url = 'https://www.xiaohongshu.com/explore/note-1?xsec_token=provided-by-page';
  await ingestSignals(store, { signals: [rawSignal({ url })] });
  assert.equal((await store.list())[0].url, url);
});

test('invalid signals fail rather than invent platform data', async () => {
  const store = await createStore();
  await assert.rejects(() => ingestSignals(store, { signals: [{ title: 'missing note id', source: source('task-1', '2026-08-30T00:00:00.000Z') }] }), /noteId/);
});
