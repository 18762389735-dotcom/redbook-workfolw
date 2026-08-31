import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { createAccountProfile } from '../core/account/schema.mjs';
import { evaluateOpportunity } from '../core/opportunities/evaluate-opportunity.mjs';
import { OpportunityEvaluationStore } from '../core/opportunities/opportunity-evaluation-store.mjs';
import { OpportunityStateStore } from '../core/opportunities/opportunity-state-store.mjs';
import { AccountStore } from '../core/account/account-store.mjs';
import { CreatorStore } from '../core/creators/creator-store.mjs';
import { SignalStore } from '../core/signals/signal-store.mjs';
import { createOpportunitiesApiHandler } from '../server/opportunities-api.mjs';
import { createServer } from 'node:http';
import { createSignal } from '../core/signals/schema.mjs';

const folders = [];
afterEach(async () => Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true }))));
const signal = createSignal({ noteId: 'signal-only-note', title: '真实 AI 工具素材', bodyText: '一个真实使用场景', author: { id: 'creator-1', name: '真实作者' }, metrics: { likes: 120 }, source: { provider: 'beav', method: 'current-note', taskId: 'task-1' } });

test('Signal-only evaluation creates a low-confidence Opportunity without cluster or baseline', () => {
  const result = evaluateOpportunity({ signal });
  assert.equal(result.decisionStatus, 'OBSERVE');
  assert.equal(result.confidence, 'low');
  assert.equal(result.evidenceSignalIds[0], signal.id);
  assert.ok(result.missingEvidence.includes('creator_baseline_min_3'));
  assert.ok(result.missingEvidence.includes('cross_author_cluster'));
});

test('baseline enrichment raises confidence while cluster remains optional', () => {
  const result = evaluateOpportunity({ signal, creator: { userId: 'creator-1', metrics: { followers: 4462 } }, baseline: { status: 'not_observed', baseline: { sampleCount: 4 } } });
  assert.equal(result.confidence, 'medium');
  assert.ok(!result.missingEvidence.includes('creator_snapshot'));
  assert.ok(!result.missingEvidence.includes('creator_baseline_min_3'));
  assert.ok(result.missingEvidence.includes('cross_author_cluster'));
});

test('configured account is optional context, not a creation gate', () => {
  const account = createAccountProfile({ positioning: 'AI 工具实践', contentPillars: ['AI 工具'], targetAudience: '设计师' });
  const result = evaluateOpportunity({ signal, accountProfile: account });
  assert.equal(result.decisionStatus, 'OBSERVE');
  assert.equal(result.accountFit.status, 'aligned');
});

test('OpportunityEvaluationStore persists explicit evaluations and is idempotent', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'opportunity-evaluation-'));
  folders.push(folder);
  const path = join(folder, 'evaluations.json');
  const store = new OpportunityEvaluationStore(path);
  assert.equal((await store.evaluate('signal-1')).created, true);
  assert.equal((await store.evaluate('signal-1')).created, false);
  assert.deepEqual(await new OpportunityEvaluationStore(path).listSignalIds(), ['signal-1']);
});

test('real Signal can be evaluated, selected, and reloaded through the Opportunity API', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'opportunity-api-'));
  folders.push(folder);
  const stores = {
    signalStore: new SignalStore(join(folder, 'signals.json')),
    creatorStore: new CreatorStore(join(folder, 'creators.json')),
    accountStore: new AccountStore(join(folder, 'account.json')),
    opportunityStateStore: new OpportunityStateStore(join(folder, 'opportunities.json')),
    opportunityEvaluationStore: new OpportunityEvaluationStore(join(folder, 'evaluations.json')),
  };
  await stores.signalStore.upsertMany([signal]);
  const handler = createOpportunitiesApiHandler(stores);
  const server = createServer((request, response) => handler(request, response));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const evaluated = await fetch(`${baseUrl}/api/opportunities/evaluate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ signalId: signal.id }) });
    assert.equal(evaluated.status, 201);
    const opportunity = (await evaluated.json()).opportunity;
    assert.equal(opportunity.confidence, 'low');
    const selected = await fetch(`${baseUrl}/api/opportunities/${encodeURIComponent(opportunity.id)}/action`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'select' }) });
    assert.equal((await selected.json()).userState, 'selected');
    const reloaded = await (await fetch(`${baseUrl}/api/opportunities`)).json();
    assert.equal(reloaded.opportunities.find((item) => item.id === opportunity.id).userState, 'selected');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
