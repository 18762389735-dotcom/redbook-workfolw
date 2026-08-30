import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDiscovery } from '../core/discovery/build-discovery.mjs';
import { buildTitleOverlapClusters } from '../core/discovery/clustering.mjs';
import { assessOutlier } from '../core/discovery/outlier.mjs';
import { classifyPublishedAt } from '../core/discovery/time.mjs';

const NOW = new Date('2026-08-30T12:00:00.000Z');
const signal = ({ noteId, authorId = 'author-1', likes = 100, method = 'creator-baseline', title = 'AI学习记录', publishedAt = '2026-08-20T00:00:00.000Z', keyword = null }) => ({
  id: `xiaohongshu:${noteId}`,
  noteId,
  title,
  author: { id: authorId, name: authorId, followerCount: null },
  metrics: { likes },
  publishedAt,
  capturedAt: '2026-08-25T00:00:00.000Z',
  source: { provider: 'test-provider', method, keyword, taskId: `task-${noteId}` },
});
const creator = (followers = 1000) => ({ userId: 'author-1', metrics: { followers } });
const baseline = (count = 3) => Array.from({ length: count }, (_, index) => signal({ noteId: `baseline-${index}`, likes: 100 }));

test('600 likes against median 100 with three baseline samples is observed at ratio 6', () => {
  const result = assessOutlier(signal({ noteId: 'target', likes: 600, method: 'visible-notes' }), baseline(), [creator()], NOW);
  assert.equal(result.status, 'observed');
  assert.equal(result.baseline.ratio, 6);
  assert.equal(result.baseline.sampleCount, 3);
});

test('300 likes against median 100 is not observed', () => {
  assert.equal(assessOutlier(signal({ noteId: 'target', likes: 300, method: 'visible-notes' }), baseline(), [creator()], NOW).status, 'not_observed');
});

test('two baseline samples are insufficient', () => {
  assert.equal(assessOutlier(signal({ noteId: 'target', likes: 600, method: 'visible-notes' }), baseline(2), [creator()], NOW).status, 'insufficient');
});

test('unknown target likes are insufficient', () => {
  assert.equal(assessOutlier(signal({ noteId: 'target', likes: null, method: 'visible-notes' }), baseline(), [creator()], NOW).status, 'insufficient');
});

test('unknown followers remain null and only lower confidence', () => {
  const result = assessOutlier(signal({ noteId: 'target', likes: 600, method: 'visible-notes' }), baseline(), [], NOW);
  assert.equal(result.status, 'observed');
  assert.equal(result.followerCount, null);
  assert.equal(result.confidence, 'low');
});

test('target note is excluded from its own creator baseline', () => {
  const samples = [...baseline(), signal({ noteId: 'target', likes: 900, method: 'creator-baseline' })];
  const result = assessOutlier(signal({ noteId: 'target', likes: 600, method: 'visible-notes' }), samples, [creator()], NOW);
  assert.equal(result.baseline.sampleCount, 3);
  assert.ok(!result.baseline.sampleSignalIds.includes('xiaohongshu:target'));
});

test('baseline-only Signals are evidence, not Discovery targets', () => {
  const result = buildDiscovery({ signals: baseline(), creators: [creator()], now: NOW });
  assert.deepEqual(result.outliers, []);
  assert.deepEqual(result.clusters, []);
});

test('publishedAt time buckets preserve current, reference, and unknown', () => {
  assert.equal(classifyPublishedAt('2026-08-01T12:00:00.000Z', NOW).bucket, 'current');
  assert.equal(classifyPublishedAt('2026-07-01T12:00:00.000Z', NOW).bucket, 'reference');
  assert.equal(classifyPublishedAt(null, NOW).bucket, 'unknown');
});

test('fewer than three independent authors cannot form a title hotspot', () => {
  const signals = [signal({ noteId: '1', authorId: 'a1' }), signal({ noteId: '2', authorId: 'a2' })];
  assert.equal(buildTitleOverlapClusters(signals, [], NOW).length, 0);
});

test('three independent authors form only low-confidence provisional cluster', () => {
  const signals = ['a1', 'a2', 'a3'].map((authorId, index) => signal({ noteId: String(index), authorId }));
  const [cluster] = buildTitleOverlapClusters(signals, [], NOW);
  assert.equal(cluster.cluster_status, 'provisional');
  assert.equal(cluster.platform_confidence, 'low');
});

test('four independent authors reach at most medium confidence', () => {
  const signals = ['a1', 'a2', 'a3', 'a4'].map((authorId, index) => signal({ noteId: String(index), authorId }));
  const [cluster] = buildTitleOverlapClusters(signals, [], NOW);
  assert.equal(cluster.platform_confidence, 'medium');
  assert.notEqual(cluster.platform_signal_strength, 'strong');
});

test('Discovery output never evaluates account or personal fit', () => {
  const signals = ['a1', 'a2', 'a3'].map((authorId, index) => signal({ noteId: String(index), authorId, method: 'visible-notes', keyword: 'AI学习' }));
  const result = buildDiscovery({ signals, creators: [], now: NOW });
  assert.ok(result.clusters.length > 0);
  assert.ok(result.clusters.every((cluster) => cluster.account_fit_status === 'not_evaluated' && cluster.personal_fit_status === 'not_evaluated'));
});

test('personal or account context cannot change the platform result', () => {
  const signals = ['a1', 'a2', 'a3'].map((authorId, index) => signal({ noteId: String(index), authorId, method: 'visible-notes', keyword: 'AI学习' }));
  const left = buildDiscovery({ signals, creators: [], now: NOW, accountProfile: { niche: '设计' } });
  const right = buildDiscovery({ signals, creators: [], now: NOW, personalContext: { job: '求职' } });
  assert.deepEqual(left, right);
});
