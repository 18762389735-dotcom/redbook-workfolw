import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { buildDiscovery } from '../core/discovery/build-discovery.mjs';
import { assessOutlier } from '../core/discovery/outlier.mjs';
import { ingestCreators } from '../core/creators/ingest-creators.mjs';
import { CreatorStore } from '../core/creators/creator-store.mjs';
import { ingestSignals } from '../core/signals/ingest-signals.mjs';
import { SignalStore } from '../core/signals/signal-store.mjs';
import { applyVerifiedCreatorContext, createBeavConnector } from '../server/beav-connector.mjs';

const CREATOR_ID = 'creator-123';
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

function notePayload(noteId, authorId) {
  return {
    noteId,
    source: `https://www.xiaohongshu.com/explore/${noteId}?xsec_token=discard`,
    title: `主页笔记 ${noteId}`,
    content: '真实主页笔记正文',
    author: authorId ? '平行设计研究所 Parallel Design' : '',
    ...(authorId === undefined ? {} : { authorId }),
    stats: { likes: '100' },
  };
}

test('creator baseline inherits verified batch owner for every normalized note', async () => {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'redbook-creator-linkage-'));
  try {
    const signalStore = new SignalStore(join(runtimeRoot, 'signals.json'));
    const creatorStore = new CreatorStore(join(runtimeRoot, 'creators.json'));
    const connector = createBeavConnector({
      ingestSignals: (payload) => ingestSignals(signalStore, payload),
      ingestCreators: (payload) => ingestCreators(creatorStore, payload),
    });

    await connector.ingestCreator({
      userId: CREATOR_ID,
      nickname: '平行设计研究所 Parallel Design',
      stats: { fans: '4,462' },
      source: `https://www.xiaohongshu.com/user/profile/${CREATOR_ID}?xsec_token=discard`,
    });
    const result = await connector.ingestNotes([
      notePayload('baseline-a', CREATOR_ID),
      notePayload('baseline-b'),
      notePayload('baseline-c', 'unstable-donor-field'),
      notePayload('baseline-d', CREATOR_ID),
    ], {
      method: 'creator-baseline',
      taskId: 'creator-batch-1',
      capturedAt: '2026-08-31T04:00:00.000Z',
      creatorUserId: CREATOR_ID,
      creatorNickname: '平行设计研究所 Parallel Design',
    });

    assert.equal(result.received, 4);
    const signals = await signalStore.list();
    assert.equal(signals.length, 4);
    assert.ok(signals.every((signal) => signal.author.id === CREATOR_ID));
    assert.equal(signals.filter((signal) => creatorStore.records.has(signal.author.id)).length, 4);

    await connector.ingestNote(notePayload('target-note', CREATOR_ID), {
      method: 'visible-notes',
      taskId: 'visible-task-1',
      capturedAt: '2026-08-31T04:01:00.000Z',
      creatorUserId: CREATOR_ID,
    });
    const discovery = buildDiscovery({
      signals: await signalStore.list(),
      creators: await creatorStore.list(),
      now: new Date('2026-08-31T05:00:00.000Z'),
    });
    const assessment = discovery.outliers.find((item) => item.signalId === 'xiaohongshu:target-note');
    assert.ok(assessment);
    assert.equal(assessment.baseline.sampleCount, 4);
    assert.equal(assessment.missingEvidence.includes('creator_snapshot'), false);
  } finally {
    await rm(runtimeRoot, { recursive: true, force: true });
  }
});

test('canonical owner inheritance is disabled without explicit creator-baseline context', () => {
  const signalInput = { author: { id: 'nickname-or-unstable-id', name: null } };
  const unchanged = applyVerifiedCreatorContext(signalInput, { method: 'visible-notes' }, { creatorUserId: CREATOR_ID });
  assert.equal(unchanged.author.id, 'nickname-or-unstable-id');

  const baseline = applyVerifiedCreatorContext(signalInput, { method: 'creator-baseline' }, {
    creatorUserId: CREATOR_ID,
    creatorNickname: '平行设计研究所 Parallel Design',
  });
  assert.equal(baseline.author.id, CREATOR_ID);
  assert.equal(baseline.author.name, '平行设计研究所 Parallel Design');
});

test('homepage collector forwards its extracted creator identity as batch context', async () => {
  const source = await readFile(join(ROOT, 'extension', 'beav-redbook', 'src', 'background.js'), 'utf8');
  assert.match(source, /creatorUserId: normalizeText\(payload\?\.userId\)/);
  assert.match(source, /creatorNickname: normalizeText\(payload\?\.nickname\)/);
  assert.match(source, /method: 'creator-baseline',[\s\S]{0,220}creatorUserId: normalizeText\(payloadState\?\.userId\)/);
  assert.match(source, /method: 'creator-baseline',[\s\S]{0,220}creatorUserId: normalizeText\(options\?\.creatorUserId\)/);
});

test('re-ingesting an existing baseline note reconciles an unstable author id', async () => {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'redbook-creator-reconcile-'));
  try {
    const signalStore = new SignalStore(join(runtimeRoot, 'signals.json'));
    const connector = createBeavConnector({
      ingestSignals: (payload) => ingestSignals(signalStore, payload),
      ingestCreators: async () => ({ received: 0, created: 0, updated: 0, duplicates: 0 }),
    });
    await connector.ingestNote(notePayload('reconcile-note', 'unstable-donor-field'), {
      method: 'creator-baseline',
      taskId: 'creator-batch-old',
      capturedAt: '2026-08-31T03:00:00.000Z',
    });
    await connector.ingestNote(notePayload('reconcile-note', 'unstable-donor-field'), {
      method: 'creator-baseline',
      taskId: 'creator-batch-new',
      capturedAt: '2026-08-31T04:00:00.000Z',
      creatorUserId: CREATOR_ID,
    });
    const signals = await signalStore.list();
    assert.equal(signals.length, 1);
    assert.equal(signals[0].author.id, CREATOR_ID);
    assert.equal(signals[0].observations.length, 2);
  } finally {
    await rm(runtimeRoot, { recursive: true, force: true });
  }
});

test('five distinct baseline notes remain four samples when one note is assessed', async () => {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'redbook-creator-sample-count-'));
  try {
    const signalStore = new SignalStore(join(runtimeRoot, 'signals.json'));
    const creatorStore = new CreatorStore(join(runtimeRoot, 'creators.json'));
    const connector = createBeavConnector({
      ingestSignals: (payload) => ingestSignals(signalStore, payload),
      ingestCreators: (payload) => ingestCreators(creatorStore, payload),
    });
    await connector.ingestCreator({ userId: CREATOR_ID, nickname: '平行设计研究所 Parallel Design', stats: { fans: 4462 } });

    const notes = [
      notePayload('n1', CREATOR_ID),
      notePayload('n2', CREATOR_ID),
      notePayload('n3'),
      notePayload('n4', 'unstable-field'),
      notePayload('n5'),
    ];
    const context = {
      method: 'creator-baseline',
      creatorUserId: CREATOR_ID,
      creatorNickname: '平行设计研究所 Parallel Design',
      capturedAt: '2026-08-31T06:00:00.000Z',
    };
    await connector.ingestNotes(notes, { ...context, taskId: 'batch-1' });
    const second = await connector.ingestNotes(notes, { ...context, taskId: 'batch-2', capturedAt: '2026-08-31T07:00:00.000Z' });
    assert.equal(second.received, 5);
    assert.equal(second.duplicates, 5);

    const signals = await signalStore.list();
    const creators = await creatorStore.list();
    assert.equal(signals.length, 5);
    assert.equal(signals.filter((signal) => signal.author.id === CREATOR_ID).length, 5);
    assert.equal(signals.filter((signal) => creators.some((creator) => creator.userId === signal.author.id)).length, 5);

    const target = signals.find((signal) => signal.noteId === 'n1');
    const assessment = assessOutlier(target, signals, creators, new Date('2026-08-31T08:00:00.000Z'));
    assert.equal(assessment.baseline.sampleCount, 4);
    assert.equal(assessment.missingEvidence.includes('creator_baseline_min_3'), false);
    assert.equal(target.observations.length, 2);
  } finally {
    await rm(runtimeRoot, { recursive: true, force: true });
  }
});
