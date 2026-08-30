import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMatching } from '../core/matching/build-matching.mjs';

const cluster = (overrides = {}) => ({ signal_cluster_id: 'cluster-1', cluster_name: '标题共现：工具', cluster_status: 'provisional', platform_signal_strength: 'moderate', platform_confidence: 'medium', supporting_current_sample_ids: ['signal-1'], supporting_reference_sample_ids: [], supporting_unknown_time_sample_ids: [], missing_evidence: [], limitations: [], ...overrides });
const signal = (title = 'AI工具实际使用') => ({ id: 'signal-1', title, bodyText: '真实使用过程与设计流程' });
const profile = (overrides = {}) => ({ positioning: '', niche: '创作', targetAudience: '', contentPillars: [], accountPromise: [], strengths: [], weaknesses: [], contentBoundaries: [], privacyConstraints: [], currentContext: { recentlyDoing: '', currentProjects: [], currentTools: [], currentLearning: [], currentGoals: [] }, ...overrides });
const run = (accountProfile = profile(), title, clusterOverrides) => buildMatching({ discovery: { clusters: [cluster(clusterOverrides)] }, signals: [signal(title)], accountProfile, now: new Date('2026-08-30T00:00:00.000Z') }).matches[0];

test('empty Account is unknown and missing account context', () => {
  const match = run({ currentContext: {} }); assert.equal(match.account_fit.status, 'unknown'); assert.equal(match.matching_result.strategy_readiness, 'missing_account_context');
});
test('exact contentPillar match is aligned', () => { const match = run(profile({ contentPillars: ['AI工具'] })); assert.equal(match.account_fit.status, 'aligned'); assert.ok(match.account_fit.matched_profile_fields.includes('contentPillars')); });
test('two meaningful overlap tokens are aligned', () => { assert.equal(run(profile({ strengths: ['工具流程'] }), '工具实践流程拆解').account_fit.status, 'aligned'); });
test('one meaningful overlap token is adjacent', () => { assert.equal(run(profile({ strengths: ['工具观察'] }), '工具实践').account_fit.status, 'adjacent'); });
test('ready profile with zero overlap is not_aligned', () => { assert.equal(run(profile({ niche: '园林景观' }), 'AI工具实践').account_fit.status, 'not_aligned'); });
test('current context direct match is supported', () => { assert.equal(run(profile({ contentPillars: ['设计'], currentContext: { currentTools: ['Figma'] } }), 'Figma设计流程').current_relevance.status, 'supported'); });
test('empty current context is unknown', () => { const match = run(profile({ contentPillars: ['AI工具'] })); assert.equal(match.current_relevance.status, 'unknown'); assert.ok(match.current_relevance.missing_current_context.length); });
test('content boundary direct match becomes blocking factor', () => { const match = run(profile({ contentPillars: ['AI工具'], contentBoundaries: ['求职经历'] }), 'AI工具与求职经历'); assert.ok(match.matching_result.blocking_factors[0].includes('求职经历')); assert.equal(match.matching_result.strategy_readiness, 'not_ready_content_boundary'); });
test('privacy constraints pass through unchanged', () => { assert.deepEqual(run(profile({ contentPillars: ['AI工具'], privacyConstraints: ['不展示真实姓名'] })).matching_result.privacy_constraints, ['不展示真实姓名']); });
test('Matching does not mutate Discovery', () => { const discovery = { clusters: [cluster()] }; const before = structuredClone(discovery); buildMatching({ discovery, signals: [signal()], accountProfile: profile() }); assert.deepEqual(discovery, before); });
test('same Discovery and Account produce identical semantic matches', () => { const args = { discovery: { clusters: [cluster()] }, signals: [signal()], accountProfile: profile({ contentPillars: ['AI工具'] }), now: new Date('2026-08-30T00:00:00.000Z') }; assert.deepEqual(buildMatching(args).matches, buildMatching(args).matches); });
test('Matching confidence never raises low platform confidence', () => { const match = run(profile({ contentPillars: ['AI工具'] }), undefined, { platform_confidence: 'low' }); assert.equal(match.platform_signal.platform_confidence, 'low'); assert.equal(match.matching_result.matching_confidence, 'low'); });
