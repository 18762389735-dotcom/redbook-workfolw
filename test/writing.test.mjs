import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { buildDraftFromBrief, buildWritingBrief } from '../core/writing/build-draft.mjs';
import { DraftStore } from '../core/writing/draft-store.mjs';
import { createWritingApiHandler } from '../server/writing-api.mjs';

const folders = [];
const opportunity = {
  id: 'opportunity:c1',
  clusterId: 'c1',
  title: 'AI 工具的真实使用方法',
  decisionStatus: 'QUALIFIED',
  matchingConfidence: 'medium',
  whyNow: ['有 3 位独立作者支持该方向。'],
  whyFit: ['账号定位与该方向存在直接匹配。'],
  evidenceSignalIds: ['xiaohongshu:n1'],
  evidenceSignals: [{ id: 'xiaohongshu:n1', title: '我的 AI 工作流' }],
  accountFit: { status: 'aligned' },
  blockingFactors: [],
  missingEvidence: [],
  privacyConstraints: [],
  userState: 'selected',
};
const signal = {
  id: 'xiaohongshu:n1',
  noteId: 'n1',
  title: '我的 AI 工作流',
  bodyText: '记录一次真实的工作流改造。',
  url: 'https://www.xiaohongshu.com/explore/n1',
  author: { id: 'author-1', name: '真实作者' },
  metrics: { likes: 1234, favorites: 56, comments: 7, shares: null },
  publishedAt: '2026-08-30T00:00:00.000Z',
  capturedAt: '2026-08-31T00:00:00.000Z',
  source: { provider: 'beav', method: 'visible-notes' },
};
const sparseOpportunity = {
  id: 'opportunity:sparse-signal',
  title: '只有一条真实 Signal 的观察机会',
  decisionStatus: 'OBSERVE',
  confidence: 'low',
  whyNow: ['单条真实素材已经进入工作台。'],
  evidenceSignalIds: ['xiaohongshu:n1'],
  accountFit: null,
  cluster: null,
  baseline: null,
  missingEvidence: ['cross_author_cluster', 'account_profile'],
  userState: 'selected',
};

afterEach(async () => Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true }))));

test('brief and draft retain real Opportunity evidence and editable content', () => {
  const brief = buildWritingBrief({ opportunity, signals: [signal], accountProfile: { positioning: 'AI 工具实践', targetAudience: '正在提升效率的设计师' }, now: '2026-08-31T00:00:00.000Z' });
  const draft = buildDraftFromBrief(brief, '2026-08-31T00:00:00.000Z');
  assert.equal(brief.evidence[0].id, signal.id);
  assert.equal(brief.targetAudience, '正在提升效率的设计师');
  assert.equal(brief.titleCandidates.length, 5);
  assert.equal(brief.structure.length, 5);
  assert.match(draft.body, /我的 AI 工作流/);
  assert.equal(draft.references[0], signal.id);
});

test('signal-only Opportunity stays sparse-safe and preserves low-confidence evidence limits', () => {
  const brief = buildWritingBrief({ opportunity: sparseOpportunity, signals: [signal], accountProfile: null, now: '2026-08-31T00:00:00.000Z' });
  const draft = buildDraftFromBrief(brief, '2026-08-31T00:00:00.000Z');
  assert.equal(brief.confidence, 'low');
  assert.equal(brief.accountFit.status, 'unknown');
  assert.deepEqual(brief.missingEvidence, ['cross_author_cluster', 'account_profile']);
  assert.equal(brief.evidence.length, 1);
  assert.equal(brief.titleCandidates.length, 5);
  assert.equal(brief.structure.length, 5);
  assert.equal(draft.references.length, 1);
  assert.match(draft.body, /当前 Signal/);
});

test('buildDraftFromBrief accepts a minimal sparse brief without optional arrays', () => {
  const draft = buildDraftFromBrief({ opportunityId: 'opportunity:minimal', topic: '稀疏机会' });
  assert.equal(draft.title, '稀疏机会');
  assert.deepEqual(draft.references, []);
  assert.match(draft.body, /没有可引用的 Signal/);
});

test('DraftStore writes, reloads, and updates one opportunity draft', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'writing-'));
  folders.push(folder);
  const path = join(folder, 'drafts.json');
  const brief = buildWritingBrief({ opportunity, signals: [signal] });
  const draft = buildDraftFromBrief(brief);
  const store = new DraftStore(path);
  assert.equal((await store.createIfMissing(draft)).created, true);
  assert.equal((await store.createIfMissing(draft)).created, false);
  const updated = await store.update(draft.id, { title: '手工标题', body: '手工正文' });
  assert.equal(updated.title, '手工标题');
  const reloaded = await new DraftStore(path).get(draft.id);
  assert.equal(reloaded.body, '手工正文');
  assert.equal(reloaded.brief.evidence[0].id, signal.id);
});

test('Writing API creates an idempotent draft only for a selected Opportunity', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'writing-api-'));
  folders.push(folder);
  const draftStore = new DraftStore(join(folder, 'drafts.json'));
  const stores = { draftStore };
  const pipelineBuilder = async () => ({ opportunities: [opportunity], signals: [signal], accountProfile: { positioning: 'AI 工具实践', targetAudience: '设计师' } });
  const handler = createWritingApiHandler(stores, pipelineBuilder);
  const server = createServer((request, response) => handler(request, response));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const first = await fetch(`${baseUrl}/api/writing/drafts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ opportunityId: opportunity.id }) });
    assert.equal(first.status, 201);
    const firstPayload = await first.json();
    const second = await fetch(`${baseUrl}/api/writing/drafts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ opportunityId: opportunity.id }) });
    assert.equal(second.status, 200);
    assert.equal((await second.json()).draft.id, firstPayload.draft.id);
    const listed = await fetch(`${baseUrl}/api/writing`);
    assert.equal((await listed.json()).selectedOpportunity.id, opportunity.id);
    const edited = await fetch(`${baseUrl}/api/writing/drafts/${encodeURIComponent(firstPayload.draft.id)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '编辑后的标题', body: '编辑后的正文' }) });
    assert.equal((await edited.json()).draft.title, '编辑后的标题');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('Writing API refuses to draft an unselected Opportunity', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'writing-unselected-'));
  folders.push(folder);
  const draftStore = new DraftStore(join(folder, 'drafts.json'));
  const unselected = { ...opportunity, userState: 'active' };
  const handler = createWritingApiHandler({ draftStore }, async () => ({ opportunities: [unselected], signals: [signal], accountProfile: {} }));
  const server = createServer((request, response) => handler(request, response));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/writing/drafts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ opportunityId: unselected.id }) });
    assert.equal(response.status, 409);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('Writing API creates and reopens a sparse signal-only draft idempotently', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'writing-sparse-api-'));
  folders.push(folder);
  const draftStore = new DraftStore(join(folder, 'drafts.json'));
  const handler = createWritingApiHandler({ draftStore }, async () => ({ opportunities: [sparseOpportunity], signals: [signal], accountProfile: null }));
  const server = createServer((request, response) => handler(request, response));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/writing/drafts`;
    const first = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ opportunityId: sparseOpportunity.id }) });
    assert.equal(first.status, 201);
    const firstPayload = await first.json();
    assert.equal(firstPayload.draft.brief.confidence, 'low');
    assert.equal(firstPayload.draft.brief.accountFit.status, 'unknown');
    assert.equal(firstPayload.draft.brief.titleCandidates.length, 5);
    assert.equal(firstPayload.draft.brief.structure.length, 5);
    assert.equal(firstPayload.draft.references.length, 1);
    const second = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ opportunityId: sparseOpportunity.id }) });
    assert.equal(second.status, 200);
    assert.equal((await second.json()).draft.id, firstPayload.draft.id);
    assert.equal((await new DraftStore(join(folder, 'drafts.json')).list()).length, 1);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('Writing evidence renderer reads the metric key it filtered', async () => {
  const source = await readFile(new URL('../apps/web/src/pages/WritingSelectionPage.jsx', import.meta.url), 'utf8');
  assert.match(source, /\.filter\(\(\[key\]\) => Number\.isFinite\(signal\.metrics\?\.\[key\]\)\)\.map\(\(\[key, label\]\)/);
  assert.doesNotMatch(source, /\.filter\(\(\[key\]\][\s\S]{0,180}\.map\(\(\[, label\]\).*signal\.metrics\[key\]/);
});
