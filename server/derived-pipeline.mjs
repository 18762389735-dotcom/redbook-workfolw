import { buildDiscovery } from '../core/discovery/build-discovery.mjs';
import { buildMatching } from '../core/matching/build-matching.mjs';
import { buildDecisions } from '../core/decision/build-decision.mjs';
import { buildOpportunities } from '../core/opportunities/build-opportunities.mjs';
import { evaluateOpportunity } from '../core/opportunities/evaluate-opportunity.mjs';

export async function buildDerivedPipeline({ signalStore, creatorStore, accountStore, opportunityStateStore, opportunityEvaluationStore, now = new Date() }) {
  const [signals, creators, accountProfile, states, evaluatedSignalIds] = await Promise.all([
    signalStore.list(), creatorStore.list(), accountStore.get(), opportunityStateStore.list(), opportunityEvaluationStore?.listSignalIds?.() || [],
  ]);
  const discovery = buildDiscovery({ signals, creators, now });
  const matching = buildMatching({ discovery, signals, accountProfile, now });
  const decisions = buildDecisions({ discovery, matching });
  const opportunities = buildOpportunities({ discovery, decisions, signals, states });
  const representedSignalIds = new Set(opportunities.flatMap((item) => item.evidenceSignalIds || []));
  for (const signalId of evaluatedSignalIds) {
    if (representedSignalIds.has(signalId)) continue;
    const signal = signals.find((item) => item.id === signalId);
    if (!signal) continue;
    const baseline = discovery.outliers.find((item) => item.signalId === signal.id) || null;
    const creator = creators.find((item) => item.userId === signal.author?.id) || null;
    const cluster = discovery.clusters.find((item) => [
      ...(item.supporting_current_sample_ids || []),
      ...(item.supporting_reference_sample_ids || []),
      ...(item.supporting_unknown_time_sample_ids || []),
    ].includes(signal.id)) || null;
    const item = evaluateOpportunity({ signal, creator, baseline, cluster, accountProfile, now });
    const savedState = states[item.stateKey] || { state: 'active' };
    item.userState = savedState.state || 'active';
    item.manualOverride = savedState.state === 'selected' && Boolean(savedState.selectedDecisionSnapshot?.manualOverride);
    item.selectedDecisionSnapshot = savedState.state === 'selected' ? savedState.selectedDecisionSnapshot || null : null;
    opportunities.push(item);
  }
  return { signals, creators, accountProfile, discovery, matching, decisions, opportunities };
}
