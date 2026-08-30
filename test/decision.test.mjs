import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDecisions } from '../core/decision/build-decision.mjs';

const cluster = { signal_cluster_id: 'cluster-1', supporting_current_sample_ids: ['s1'], supporting_reference_sample_ids: ['s2'], supporting_unknown_time_sample_ids: ['s3'], missing_evidence: ['observed_outlier'], limitations: ['平台限制'] };
function match(readiness, overrides = {}) { return { platform_signal: { cluster_id: 'cluster-1', cluster_name: '真实 Cluster', cluster_status: 'provisional', platform_signal_strength: 'moderate', platform_confidence: 'medium' }, account_fit: { status: 'aligned', reasons: ['直接匹配'] }, current_relevance: { status: 'supported', reasons: ['当前相关'], missing_current_context: [] }, matching_result: { strategy_readiness: readiness, blocking_factors: [], privacy_constraints: ['不展示姓名'], next_step: '下一步', ...overrides } }; }
const decide = (value) => buildDecisions({ discovery: { clusters: [cluster] }, matching: { matches: [value], limitations: ['匹配限制'] } }).decisions[0];

test('ready_for_deconstruct becomes QUALIFIED', () => assert.equal(decide(match('ready_for_deconstruct')).status, 'QUALIFIED'));
test('low platform confidence with relevance becomes WATCH', () => { const value = match('not_ready_platform_confidence'); value.platform_signal.platform_confidence = 'low'; assert.equal(decide(value).status, 'WATCH'); });
test('low Matching confidence with relevance becomes WATCH', () => { const value = match('not_ready_missing_evidence'); value.platform_signal.platform_confidence = 'medium'; value.matching_result.matching_confidence = 'low'; assert.equal(decide(value).status, 'WATCH'); });
test('content boundary blocker becomes HOLD', () => assert.equal(decide(match('not_ready_content_boundary', { blocking_factors: ['边界'] })).status, 'HOLD'));
test('missing account becomes INSUFFICIENT_EVIDENCE', () => assert.equal(decide(match('missing_account_context')).status, 'INSUFFICIENT_EVIDENCE'));
test('Decision does not raise platform confidence', () => { const value = match('not_ready_platform_confidence'); value.platform_signal.platform_confidence = 'low'; assert.equal(decide(value).signal.platform_confidence, 'low'); });
test('supporting sample ids are preserved completely', () => assert.deepEqual(decide(match('ready_for_deconstruct')).evidence.supporting_sample_ids, ['s1', 's2', 's3']));
