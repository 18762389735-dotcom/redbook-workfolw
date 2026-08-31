import { buildMatching } from '../matching/build-matching.mjs';

const list = (value) => Array.isArray(value) ? value : [];
const text = (value, fallback = '') => value === null || value === undefined || String(value).trim() === '' ? fallback : String(value).trim();

function syntheticCluster(signal) {
  return {
    signal_cluster_id: `signal-evaluation:${signal.id}`,
    cluster_name: signal.title || '未命名真实素材',
    cluster_status: 'signal_only',
    platform_signal_strength: 'single_signal',
    platform_confidence: 'low',
    supporting_current_sample_ids: [signal.id],
    supporting_reference_sample_ids: [],
    supporting_unknown_time_sample_ids: [],
    observed_outlier_ids: [],
    independent_author_count: signal.author?.id ? 1 : 0,
  };
}

function evidenceCompleteness(missingEvidence) {
  const missing = new Set(missingEvidence);
  if (!missing.size) return '高';
  if (missing.size <= 2) return '中';
  return '低';
}

/**
 * Evaluate one real Signal without requiring a Discovery cluster. Existing
 * Discovery/Matching/Decision builders remain authoritative for cluster
 * opportunities; this function is the explicit, low-confidence fallback.
 */
export function evaluateOpportunity({ signal, creator = null, baseline = null, cluster = null, accountProfile = {}, matching = null, now = new Date() } = {}) {
  if (!signal?.id) throw new TypeError('Signal 是必填字段');
  const evaluationCluster = cluster || syntheticCluster(signal);
  const match = matching || buildMatching({ discovery: { clusters: [evaluationCluster] }, signals: [signal], accountProfile, now }).matches[0];
  const baselineSampleCount = Number.isFinite(baseline?.baseline?.sampleCount) ? baseline.baseline.sampleCount : 0;
  const missingEvidence = [];
  if (!creator) missingEvidence.push('creator_snapshot');
  if (baselineSampleCount < 3) missingEvidence.push('creator_baseline_min_3');
  if (!cluster) missingEvidence.push('cross_author_cluster');
  if (match?.account_fit?.status === 'unknown') missingEvidence.push('account_profile');
  const hasBaseline = baselineSampleCount >= 3;
  const confidence = cluster && hasBaseline ? (match?.matching_result?.matching_confidence || 'medium') : hasBaseline ? 'medium' : 'low';
  const decisionStatus = cluster && baseline?.status === 'observed' ? 'CONSIDER' : 'OBSERVE';
  const whyNow = [
    `真实素材《${text(signal.title, '未命名笔记')}》已进入工作台，可先做单条机会判断。`,
    hasBaseline ? `已关联作者近期 ${baselineSampleCount} 篇有效基线。` : '当前先基于单条平台 Signal 观察，不等待完整基线。',
  ];
  const whyFit = list(match?.matching_result?.why);
  return {
    id: `opportunity:signal:${signal.id}`,
    stateKey: `signal:${signal.id}`,
    signalId: signal.id,
    clusterId: cluster?.signal_cluster_id || null,
    title: text(signal.title, '未命名真实素材'),
    decisionStatus,
    confidence,
    evidenceCompleteness: evidenceCompleteness(missingEvidence),
    platform: {
      strength: cluster?.platform_signal_strength || 'single_signal',
      confidence: cluster?.platform_confidence || 'low',
      independentAuthors: cluster?.independent_author_count || (signal.author?.id ? 1 : 0),
      currentSamples: cluster?.supporting_current_sample_ids?.length || 1,
      referenceSamples: cluster?.supporting_reference_sample_ids?.length || 0,
      outlierCount: cluster?.observed_outlier_ids?.length || (baseline?.status === 'observed' ? 1 : 0),
    },
    accountFit: structuredClone(match?.account_fit || { status: 'unknown', matchedTerms: [], matchedFields: [], reasons: [] }),
    currentRelevance: structuredClone(match?.current_relevance || { status: 'unknown', matchedTerms: [], matchedFields: [], reasons: [] }),
    matchingConfidence: match?.matching_result?.matching_confidence || 'low',
    strategyReadiness: match?.matching_result?.strategy_readiness || 'missing_account_context',
    whyNow,
    whyFit,
    evidenceSignalIds: [signal.id],
    evidenceSignals: [{ id: signal.id, title: text(signal.title, '未命名笔记') }],
    missingEvidence,
    limitations: ['这是 Signal-only 的低置信度评估，不替代 Discovery 的跨作者证据。'],
    privacyConstraints: list(accountProfile.privacyConstraints),
    blockingFactors: list(match?.matching_result?.blocking_factors),
    nextStep: missingEvidence.length ? '补充作者资料、近期基线或账号资料后重新评估。' : '可进入创作准备，并在发布前人工复核。',
    userState: 'active',
    manualOverride: false,
    selectedDecisionSnapshot: null,
    generatedAt: new Date(now).toISOString(),
  };
}
