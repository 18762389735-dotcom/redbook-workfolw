import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { OpportunityStateStore } from '../core/opportunities/opportunity-state-store.mjs';
import { buildOpportunities } from '../core/opportunities/build-opportunities.mjs';

const folders = [];
afterEach(async () => Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true }))));
async function stores() { const folder = await mkdtemp(join(tmpdir(), 'opportunity-')); folders.push(folder); return { path: join(folder, 'states.json'), store: new OpportunityStateStore(join(folder, 'states.json')) }; }
const decision = (status = 'WATCH') => ({ decision_id: 'decision:c1', status, signal: { cluster_id: 'c1', cluster_name: '真实机会', platform_signal_strength: 'weak', platform_confidence: 'low' }, match: { account_fit: { status: 'aligned', reasons: ['匹配'] }, current_relevance: { status: 'supported', reasons: ['相关'] }, matching_result: { matching_confidence: 'low', strategy_readiness: 'not_ready_platform_confidence', blocking_factors: [] } }, evidence: { supporting_sample_ids: ['s1'] }, missing_evidence: [], limitations: ['限制'], privacy_constraints: ['隐私'], next_step: '观察' });

test('save survives reload', async () => { const { path, store } = await stores(); await store.applyAction('c1', 'save', decision()); assert.equal((await new OpportunityStateStore(path).list()).c1.state, 'saved'); });
test('dismiss survives reload', async () => { const { path, store } = await stores(); await store.applyAction('c1', 'dismiss', decision()); assert.equal((await new OpportunityStateStore(path).list()).c1.state, 'dismissed'); });
test('select survives reload', async () => { const { path, store } = await stores(); await store.applyAction('c1', 'select', decision('QUALIFIED')); assert.equal((await new OpportunityStateStore(path).list()).c1.state, 'selected'); });
test('WATCH manual select preserves status and marks override', async () => { const { store } = await stores(); const state = await store.applyAction('c1', 'select', decision('WATCH')); assert.equal(state.selectedDecisionSnapshot.decisionStatus, 'WATCH'); assert.equal(state.selectedDecisionSnapshot.manualOverride, true); });
test('reopen clears the active manual selection snapshot', async () => { const { store } = await stores(); await store.applyAction('c1', 'select', decision('WATCH')); const state = await store.applyAction('c1', 'reopen', decision('WATCH')); assert.equal(state.state, 'active'); assert.equal(state.selectedDecisionSnapshot, null); });
test('derived Opportunity changes while saved state remains by clusterId', () => { const discovery = { clusters: [{ signal_cluster_id: 'c1', supporting_current_sample_ids: ['s1'], supporting_reference_sample_ids: [], observed_outlier_ids: [], independent_author_count: 3, platform_confidence: 'low' }] }; const states = { c1: { state: 'saved' } }; const before = buildOpportunities({ discovery, decisions: { decisions: [decision()] }, signals: [{ id: 's1', title: '证据' }], states })[0]; const changed = decision(); changed.match.account_fit.status = 'not_aligned'; const after = buildOpportunities({ discovery, decisions: { decisions: [changed] }, signals: [{ id: 's1', title: '证据' }], states })[0]; assert.equal(before.userState, 'saved'); assert.equal(after.userState, 'saved'); assert.notEqual(before.accountFit.status, after.accountFit.status); });
