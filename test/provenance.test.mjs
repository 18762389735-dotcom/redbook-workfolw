import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { buildDiscovery } from '../core/discovery/build-discovery.mjs';
import { assessOutlier } from '../core/discovery/outlier.mjs';
import {
  getBaselineObservations,
  getDiscoveryObservations,
  getObservedKeywords,
  hasObservationMethod,
  isDiscoveryEligibleSignal,
} from '../core/signals/provenance.mjs';
import { SignalStore } from '../core/signals/signal-store.mjs';
import { ingestSignals } from '../core/signals/ingest-signals.mjs';

const folders = [];
afterEach(async () => Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true }))));

async function storeFixture() {
  const folder = await mkdtemp(join(tmpdir(), 'provenance-'));
  folders.push(folder);
  return new SignalStore(join(folder, 'signals.json'));
}

const source = (method, taskId, capturedAt, keyword = null) => ({ provider: 'test-provider', method, taskId, capturedAt, keyword });
const raw = (noteId, method, taskId, capturedAt, options = {}) => ({
  note_id: noteId,
  title: options.title || 'AI工具实践',
  user: { user_id: options.authorId || 'author-1', nickname: options.authorId || 'author-1' },
  liked_count: options.likes ?? 100,
  source: source(method, taskId, capturedAt, options.keyword),
});

test('version 1 data migrates transparently to version 2 observations', async () => {
  const store = await storeFixture();
  const oldRecord = {
    id: 'xiaohongshu:legacy-note', platform: 'xiaohongshu', noteId: 'legacy-note', url: null, title: '旧数据', bodyText: null,
    author: { id: 'legacy-author', name: '旧作者', profileUrl: null, followerCount: null },
    metrics: { likes: 10, favorites: null, comments: null, shares: null },
    media: { cover: null, images: [], type: null }, publishedAt: null, capturedAt: '2026-08-01T00:00:00.000Z',
    source: { provider: 'legacy', method: 'visible-notes', keyword: 'AI', taskId: 'legacy-task' },
  };
  await writeFile(store.filePath, JSON.stringify({ version: 1, signals: [oldRecord] }), 'utf8');
  const [migrated] = await store.list();
  assert.equal(migrated.observations.length, 1);
  assert.deepEqual(migrated.observations[0], { ...oldRecord.source, capturedAt: oldRecord.capturedAt });
  const persisted = JSON.parse(await readFile(store.filePath, 'utf8'));
  assert.equal(persisted.version, 2);
  assert.equal(persisted.signals[0].observations[0].keyword, 'AI');
});

test('same note keeps discovery and baseline observations without a platform update', async () => {
  const store = await storeFixture();
  await ingestSignals(store, { signals: [raw('note-a', 'visible-notes', 'discovery-1', '2026-08-01T00:00:00.000Z', { keyword: 'AI工具' })] });
  const result = await ingestSignals(store, { signals: [raw('note-a', 'creator-baseline', 'baseline-1', '2026-08-02T00:00:00.000Z')] });
  assert.deepEqual(result, { received: 1, created: 0, updated: 0, duplicates: 1 });
  const [signal] = await store.list();
  assert.equal(signal.observations.length, 2);
  assert.ok(hasObservationMethod(signal, 'visible-notes'));
  assert.ok(hasObservationMethod(signal, 'creator-baseline'));
  assert.deepEqual(getObservedKeywords(signal), ['AI工具']);
  assert.equal(signal.source.method, 'creator-baseline');
});

test('same task observation is deduplicated while different tasks survive reload', async () => {
  const store = await storeFixture();
  await ingestSignals(store, { signals: [raw('note-a', 'visible-notes', 'task-1', '2026-08-01T00:00:00.000Z')] });
  await ingestSignals(store, { signals: [raw('note-a', 'visible-notes', 'task-1', '2026-08-01T00:01:00.000Z')] });
  await ingestSignals(store, { signals: [raw('note-a', 'visible-notes', 'task-2', '2026-08-02T00:00:00.000Z')] });
  const reloaded = new SignalStore(store.filePath);
  const [signal] = await reloaded.list();
  assert.equal(signal.observations.length, 2);
  assert.deepEqual(signal.observations.map((item) => item.taskId), ['task-1', 'task-2']);
});

test('baseline first then discovery makes a Signal eligible without losing baseline role', async () => {
  const store = await storeFixture();
  await ingestSignals(store, { signals: [raw('note-a', 'creator-baseline', 'baseline-1', '2026-08-01T00:00:00.000Z')] });
  assert.equal(isDiscoveryEligibleSignal((await store.list())[0]), false);
  await ingestSignals(store, { signals: [raw('note-a', 'visible-notes', 'discovery-1', '2026-08-02T00:00:00.000Z', { keyword: 'AI学习' })] });
  const [signal] = await store.list();
  assert.equal(isDiscoveryEligibleSignal(signal), true);
  assert.equal(getDiscoveryObservations(signal).length, 1);
  assert.equal(getBaselineObservations(signal).length, 1);
});

test('historical discovery keyword survives latest baseline and builds its cluster', async () => {
  const store = await storeFixture();
  await ingestSignals(store, { signals: [raw('note-a', 'visible-notes', 'discovery-1', '2026-08-01T00:00:00.000Z', { keyword: 'AI工具' })] });
  await ingestSignals(store, { signals: [raw('note-a', 'creator-baseline', 'baseline-1', '2026-08-02T00:00:00.000Z')] });
  const discovery = buildDiscovery({ signals: await store.list(), creators: [], now: new Date('2026-08-30T00:00:00.000Z') });
  assert.equal(discovery.outliers.length, 1);
  const cluster = discovery.clusters.find((item) => item.signal_cluster_id === 'keyword:AI%E5%B7%A5%E5%85%B7');
  assert.equal([...cluster.supporting_current_sample_ids, ...cluster.supporting_reference_sample_ids, ...cluster.supporting_unknown_time_sample_ids].length, 1);
});

test('baseline-only notes cannot contaminate title clusters or target counts', async () => {
  const store = await storeFixture();
  await ingestSignals(store, { signals: [raw('target', 'visible-notes', 'discovery-1', '2026-08-20T00:00:00.000Z', { authorId: 'discovered', title: '真实发现' })] });
  await ingestSignals(store, { signals: Array.from({ length: 12 }, (_, index) => raw(`baseline-${index}`, 'creator-baseline', 'baseline-1', '2026-08-21T00:00:00.000Z', { authorId: `baseline-author-${index}`, title: '相同标题内容' })) });
  const result = buildDiscovery({ signals: await store.list(), creators: [], now: new Date('2026-08-30T00:00:00.000Z') });
  assert.equal(result.outliers.length, 1);
  assert.equal(result.outliers[0].signalId, 'xiaohongshu:target');
  assert.equal(result.clusters.filter((cluster) => cluster.signal_cluster_id.startsWith('title-overlap:')).length, 0);
});

test('baseline observations remain available to another discovered target and exclude itself', async () => {
  const store = await storeFixture();
  await ingestSignals(store, { signals: [
    raw('target', 'visible-notes', 'discovery-1', '2026-08-20T00:00:00.000Z', { likes: 600 }),
    raw('baseline-a', 'creator-baseline', 'baseline-1', '2026-08-21T00:00:00.000Z'),
    raw('baseline-b', 'creator-baseline', 'baseline-1', '2026-08-21T00:00:01.000Z'),
    raw('baseline-c', 'creator-baseline', 'baseline-1', '2026-08-21T00:00:02.000Z'),
  ] });
  await ingestSignals(store, { signals: [raw('target', 'creator-baseline', 'baseline-1', '2026-08-21T00:00:03.000Z', { likes: 600 })] });
  const signals = await store.list();
  const target = signals.find((item) => item.noteId === 'target');
  const assessment = assessOutlier(target, signals, [], new Date('2026-08-30T00:00:00.000Z'));
  assert.equal(assessment.status, 'observed');
  assert.equal(assessment.baseline.sampleCount, 3);
  assert.ok(!assessment.baseline.sampleSignalIds.includes(target.id));
});

test('latest task metadata and membership use observations', async () => {
  const store = await storeFixture();
  await ingestSignals(store, { signals: [raw('note-a', 'visible-notes', 'task-old', '2026-08-01T00:00:00.000Z')] });
  await ingestSignals(store, { signals: [raw('note-b', 'visible-notes', 'task-middle', '2026-08-02T00:00:00.000Z')] });
  await ingestSignals(store, { signals: [raw('note-a', 'creator-baseline', 'task-latest', '2026-08-03T00:00:00.000Z')] });
  const snapshot = await store.listWithMetadata();
  assert.equal(snapshot.latestTaskId, 'task-latest');
  assert.equal(snapshot.latestCapturedAt, '2026-08-03T00:00:00.000Z');
  assert.deepEqual(snapshot.signals.filter((signal) => signal.observations.some((observation) => observation.taskId === snapshot.latestTaskId)).map((signal) => signal.noteId), ['note-a']);
});
