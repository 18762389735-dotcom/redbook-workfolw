import { randomUUID } from 'node:crypto';
import { ACCOUNT_FIELDS, CONTEXT_FIELDS, contextReady, profileReady } from './schema.mjs';
import { directMatch, tokenize } from './tokenizer.mjs';

const list = (value) => Array.isArray(value) ? value : value ? [value] : [];
const fieldItems = (object, fields) => fields.flatMap((field) => list(object?.[field]).map((value) => ({ field, value: String(value).trim() })).filter((item) => item.value));
const supportingIds = (cluster) => [...new Set([
  ...(cluster.supporting_current_sample_ids || []),
  ...(cluster.supporting_reference_sample_ids || []),
  ...(cluster.supporting_unknown_time_sample_ids || []),
])];

function candidateCorpus(cluster, signalsById) {
  const evidence = supportingIds(cluster).map((id) => signalsById.get(id)).filter(Boolean);
  return [cluster.cluster_name, ...evidence.map((signal) => signal.title), ...evidence.map((signal) => String(signal.bodyText || '').slice(0, 240))].filter(Boolean).join('\n');
}

function evaluateFit(items, corpus, ready, directFields, labels) {
  if (!ready) return { status: 'unknown', matchedTerms: [], matchedFields: [], reasons: [] };
  const corpusTokens = new Set(tokenize(corpus));
  const direct = items.filter((item) => directMatch(item.value, corpus));
  const matchedTerms = [...new Set(items.flatMap((item) => tokenize(item.value)).filter((token) => corpusTokens.has(token)))];
  const matchedFields = [...new Set([...direct.map((item) => item.field), ...items.filter((item) => tokenize(item.value).some((token) => matchedTerms.includes(token))).map((item) => item.field)])];
  const strongDirect = direct.some((item) => directFields.includes(item.field));
  const status = strongDirect || matchedTerms.length >= 2 ? labels.strong : matchedTerms.length === 1 ? labels.partial : labels.none;
  const reasons = [];
  for (const item of direct) reasons.push(`${labels.prefix}${item.field}“${item.value}”存在直接匹配`);
  if (!direct.length && matchedTerms.length) reasons.push(`${labels.prefix}存在词项交集：${matchedTerms.join('、')}`);
  if (!matchedTerms.length && !direct.length) reasons.push(`${labels.prefix}未发现明确匹配证据`);
  return { status, matchedTerms, matchedFields, reasons, evidenceClear: strongDirect || matchedTerms.length >= 2 };
}

function readiness({ accountReady, accountFit, relevance, platformConfidence, blockingFactors }) {
  if (!accountReady) return 'missing_account_context';
  if (blockingFactors.length) return 'not_ready_content_boundary';
  if (accountFit === 'not_aligned') return 'not_ready_account_fit';
  if (platformConfidence === 'low') return 'not_ready_platform_confidence';
  if (relevance === 'unknown') return 'missing_current_context';
  if (accountFit === 'aligned' && ['supported', 'moderate'].includes(relevance) && platformConfidence === 'medium') return 'ready_for_deconstruct';
  return 'not_ready_missing_evidence';
}

function disposition(strategyReadiness) {
  if (strategyReadiness === 'ready_for_deconstruct') return 'qualified';
  if (strategyReadiness === 'not_ready_account_fit') return 'not_fit';
  if (['missing_account_context', 'missing_current_context'].includes(strategyReadiness)) return 'insufficient_context';
  return 'consider_with_constraints';
}

function nextStep(strategyReadiness) {
  const steps = {
    ready_for_deconstruct: '可由用户选择并进入创作准备。',
    missing_account_context: '先在“我的账号”补充账号定位、领域、目标受众或内容支柱。',
    missing_current_context: '补充最近在做什么、当前项目、工具、学习或目标。',
    not_ready_content_boundary: '核对已命中的内容边界，必要时由用户人工决定是否继续。',
    not_ready_account_fit: '保留平台信号，但当前不建议作为账号内容方向。',
    not_ready_platform_confidence: '继续观察平台样本，不修改现有平台置信度。',
  };
  return steps[strategyReadiness] || '补充缺失证据后重新评估。';
}

export function buildMatching({ discovery = {}, signals = [], accountProfile = {}, now = new Date() } = {}) {
  const signalsById = new Map(signals.map((signal) => [signal.id, signal]));
  const accountReady = profileReady(accountProfile);
  const currentReady = contextReady(accountProfile);
  const accountItems = fieldItems(accountProfile, ACCOUNT_FIELDS);
  const contextItems = fieldItems(accountProfile.currentContext || {}, CONTEXT_FIELDS);
  const matches = (discovery.clusters || []).map((cluster) => {
    const corpus = candidateCorpus(cluster, signalsById);
    const fit = evaluateFit(accountItems, corpus, accountReady, ['contentPillars', 'positioning'], { strong: 'aligned', partial: 'adjacent', none: 'not_aligned', prefix: '账号字段 ' });
    const relevance = evaluateFit(contextItems, corpus, currentReady, CONTEXT_FIELDS, { strong: 'supported', partial: 'moderate', none: 'unsupported', prefix: '当前状态 ' });
    const blockingFactors = list(accountProfile.contentBoundaries).filter((boundary) => directMatch(boundary, corpus)).map((boundary) => `命中用户确认的内容边界：${boundary}`);
    const strategyReadiness = readiness({ accountReady, accountFit: fit.status, relevance: relevance.status, platformConfidence: cluster.platform_confidence, blockingFactors });
    const matchingConfidence = accountReady && fit.status === 'aligned' && fit.evidenceClear && cluster.platform_confidence === 'medium' ? 'medium' : 'low';
    return {
      platform_signal: {
        cluster_id: cluster.signal_cluster_id,
        cluster_name: cluster.cluster_name,
        cluster_status: cluster.cluster_status,
        platform_signal_strength: cluster.platform_signal_strength,
        platform_confidence: cluster.platform_confidence,
      },
      account_fit: { status: fit.status, matched_terms: fit.matchedTerms, matched_profile_fields: fit.matchedFields, reasons: fit.reasons },
      current_relevance: { status: relevance.status, matched_terms: relevance.matchedTerms, matched_context_fields: relevance.matchedFields, reasons: relevance.reasons, missing_current_context: currentReady ? [] : CONTEXT_FIELDS },
      matching_result: {
        matching_disposition: disposition(strategyReadiness),
        matching_confidence: matchingConfidence,
        strategy_readiness: strategyReadiness,
        why: [...fit.reasons, ...relevance.reasons],
        blocking_factors: blockingFactors,
        privacy_constraints: [...list(accountProfile.privacyConstraints)],
        next_step: nextStep(strategyReadiness),
      },
    };
  });
  return {
    run_id: `matching:${randomUUID()}`,
    generated_at: new Date(now).toISOString(),
    matches,
    limitations: ['Matching 使用透明词项与完整短语匹配，不代表语义理解。', 'Matching 不修改 Platform Discovery 的任何证据或置信度。'],
  };
}
