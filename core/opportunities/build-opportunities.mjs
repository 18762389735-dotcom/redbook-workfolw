const clusterMap = (discovery) => new Map((discovery.clusters || []).map((cluster) => [cluster.signal_cluster_id, cluster]));

function whyNow(cluster) {
  const current = cluster.supporting_current_sample_ids?.length || 0;
  const reference = cluster.supporting_reference_sample_ids?.length || 0;
  const outliers = cluster.observed_outlier_ids?.length || 0;
  const reasons = [`当前有 ${cluster.independent_author_count || 0} 位独立作者支持该 provisional cluster。`];
  if (outliers) reasons.push(`存在 ${outliers} 篇已观察到的 creator outlier。`);
  reasons.push(`当前时间窗样本 ${current} 条，参考样本 ${reference} 条。`);
  reasons.push(`Platform confidence 为 ${cluster.platform_confidence}。`);
  if (current <= 1 && reference >= 1 && cluster.platform_confidence === 'low') reasons.push('当前时间窗证据仍少，主要由参考样本支撑。');
  return reasons;
}

function whyFit(match) {
  const reasons = [...(match.account_fit.reasons || []), ...(match.current_relevance.reasons || [])];
  if (match.account_fit.status === 'adjacent') reasons.push('存在有限词项交集，暂不足以确认强匹配。');
  return [...new Set(reasons)];
}

export function buildOpportunities({ discovery = {}, decisions = {}, signals = [], states = {} } = {}) {
  const clusters = clusterMap(discovery);
  const signalById = new Map(signals.map((signal) => [signal.id, signal]));
  return (decisions.decisions || []).map((decision) => {
    const clusterId = decision.signal.cluster_id;
    const cluster = clusters.get(clusterId);
    const savedState = states[clusterId] || { state: 'active' };
    return {
      id: `opportunity:${clusterId}`,
      clusterId,
      title: decision.signal.cluster_name,
      decisionStatus: decision.status,
      platform: {
        strength: decision.signal.platform_signal_strength,
        confidence: decision.signal.platform_confidence,
        independentAuthors: cluster?.independent_author_count || 0,
        currentSamples: cluster?.supporting_current_sample_ids?.length || 0,
        referenceSamples: cluster?.supporting_reference_sample_ids?.length || 0,
        outlierCount: cluster?.observed_outlier_ids?.length || 0,
      },
      accountFit: structuredClone(decision.match.account_fit),
      currentRelevance: structuredClone(decision.match.current_relevance),
      matchingConfidence: decision.match.matching_result.matching_confidence,
      strategyReadiness: decision.match.matching_result.strategy_readiness,
      whyNow: whyNow(cluster || {}),
      whyFit: whyFit(decision.match),
      evidenceSignalIds: [...decision.evidence.supporting_sample_ids],
      evidenceSignals: decision.evidence.supporting_sample_ids.map((id) => ({ id, title: signalById.get(id)?.title || null })).filter((item) => item.title),
      missingEvidence: [...decision.missing_evidence],
      limitations: [...decision.limitations],
      privacyConstraints: [...decision.privacy_constraints],
      blockingFactors: [...(decision.match.matching_result.blocking_factors || [])],
      nextStep: decision.next_step,
      userState: savedState.state || 'active',
      manualOverride: savedState.state === 'selected' && Boolean(savedState.selectedDecisionSnapshot?.manualOverride),
      selectedDecisionSnapshot: savedState.state === 'selected' ? savedState.selectedDecisionSnapshot || null : null,
    };
  });
}
