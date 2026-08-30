import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { AccountStore } from '../core/account/account-store.mjs';
import { CreatorStore } from '../core/creators/creator-store.mjs';
import { OpportunityStateStore } from '../core/opportunities/opportunity-state-store.mjs';
import { createSignal } from '../core/signals/schema.mjs';
import { SignalStore } from '../core/signals/signal-store.mjs';
import { createAccountApiHandler } from '../server/account-api.mjs';
import { createMatchingApiHandler } from '../server/matching-api.mjs';
import { createOpportunitiesApiHandler } from '../server/opportunities-api.mjs';

const cleanups = [];
afterEach(async () => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

async function fixture() {
  const folder = await mkdtemp(join(tmpdir(), 'workspace-api-'));
  const stores = { signalStore: new SignalStore(join(folder, 'signals.json')), creatorStore: new CreatorStore(join(folder, 'creators.json')), accountStore: new AccountStore(join(folder, 'account.json')), opportunityStateStore: new OpportunityStateStore(join(folder, 'opportunities.json')) };
  await stores.signalStore.upsertMany([createSignal({ noteId: 'real-note', title: 'AI工具真实使用', bodyText: '设计工作流', author: { id: 'author-1' }, metrics: { likes: 10 }, publishedAt: '2026-08-20T00:00:00.000Z', source: { provider: 'test', method: 'visible-notes', keyword: 'AI工具', taskId: 'task-1' }, capturedAt: '2026-08-30T00:00:00.000Z' })]);
  const accountApi = createAccountApiHandler(stores.accountStore); const matchingApi = createMatchingApiHandler(stores); const opportunityApi = createOpportunitiesApiHandler(stores);
  const server = createServer((request, response) => request.url.startsWith('/api/account') ? accountApi(request, response) : request.url.startsWith('/api/opportunities') ? opportunityApi(request, response) : matchingApi(request, response));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(async () => { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); await rm(folder, { recursive: true, force: true }); });
  return { baseUrl: `http://127.0.0.1:${server.address().port}` };
}

async function configuredFixture() {
  const value = await fixture();
  await fetch(`${value.baseUrl}/api/account`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contentPillars: ['AI工具'], currentContext: { currentProjects: ['AI工具'] } }) });
  return value;
}

test('Account API saves and reloads user-confirmed profile', async () => { const { baseUrl } = await configuredFixture(); const account = await (await fetch(`${baseUrl}/api/account`)).json(); assert.deepEqual(account.contentPillars, ['AI工具']); assert.equal(account.fieldSources.contentPillars, 'user_confirmed'); });
test('Matching API composes current stores on demand', async () => { const { baseUrl } = await configuredFixture(); const result = await (await fetch(`${baseUrl}/api/matching`)).json(); assert.equal(result.matches.length, 1); assert.equal(result.matches[0].account_fit.status, 'aligned'); });
test('Decisions API returns one Decision for each Match', async () => { const { baseUrl } = await configuredFixture(); const result = await (await fetch(`${baseUrl}/api/decisions`)).json(); assert.equal(result.decisions.length, 1); assert.equal(result.decisions[0].status, 'WATCH'); });
test('Opportunities API returns renderable evidence trace', async () => { const { baseUrl } = await configuredFixture(); const result = await (await fetch(`${baseUrl}/api/opportunities`)).json(); assert.equal(result.opportunities[0].evidenceSignalIds[0], 'xiaohongshu:real-note'); assert.equal(result.opportunities[0].decisionStatus, 'WATCH'); });
test('Opportunity action API preserves WATCH during manual selection', async () => { const { baseUrl } = await configuredFixture(); const list = await (await fetch(`${baseUrl}/api/opportunities`)).json(); const item = list.opportunities[0]; const selected = await (await fetch(`${baseUrl}/api/opportunities/${encodeURIComponent(item.id)}/action`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'select' }) })).json(); assert.equal(selected.userState, 'selected'); assert.equal(selected.decisionStatus, 'WATCH'); assert.equal(selected.manualOverride, true); });
