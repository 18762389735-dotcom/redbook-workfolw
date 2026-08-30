const supportIds = (cluster) => [...new Set([
  ...(cluster?.supporting_current_sample_ids || []),
  ...(cluster?.supporting_reference_sample_ids || []),
  ...(cluster?.supporting_unknown_time_sample_ids || []),
])];

function decisionStatus(match) {
  const readiness = match.matching_result.strategy_readiness;
  if (readiness === 'ready_for_deconstruct') return 'QUALIFIED';
  if (readiness === 'missing_account_context') return 'INSUFFICIENT_EVIDENCE';
  if (['not_ready_content_boundary', 'not_ready_account_fit', 'missing_current_context'].includes(readiness)) return 'HOLD';
  const relevant = ['aligned', 'adjacent'].includes(match.account_fit.status) || ['supported', 'moderate'].includes(match.current_relevance.status);
  const lowConfidence = match.platform_signal.platform_confidence === 'low' || match.matching_result.matching_confidence === 'low';
  if (relevant && lowConfidence) return 'WATCH';
  return 'INSUFFICIENT_EVIDENCE';
}

export function buildDecisions({ discovery = {}, matching = {} } = {}) {
  const clusters = new Map((discovery.clusters || []).map((cluster) => [cluster.signal_cluster_id, cluster]));
  const decisions = (matching.matches || []).map((match) => {
    const cluster = clusters.get(match.platform_signal.cluster_id);
    const status = decisionStatus(match);
    return {
      decision_id: `decision:${match.platform_signal.cluster_id}`,
      status,
      signal: structuredClone(match.platform_signal),
      match: structuredClone(match),
      evidence: {
        supporting_sample_ids: supportIds(cluster),
        reasons: [...(match.account_fit.reasons || []), ...(match.current_relevance.reasons || [])],
      },
      missing_evidence: [...new Set([...(cluster?.missing_evidence || []), ...(match.current_relevance.missing_current_context || [])])],
      limitations: [...new Set([...(cluster?.limitations || []), ...(matching.limitations || [])])],
      privacy_constraints: [...(match.matching_result.privacy_constraints || [])],
      next_step: match.matching_result.next_step,
    };
  });
  return { generated_at: matching.generated_at || new Date().toISOString(), decisions, limitations: [...(matching.limitations || [])] };
}
