import { buildDiscovery } from '../core/discovery/build-discovery.mjs';
import { buildMatching } from '../core/matching/build-matching.mjs';
import { buildDecisions } from '../core/decision/build-decision.mjs';
import { buildOpportunities } from '../core/opportunities/build-opportunities.mjs';

export async function buildDerivedPipeline({ signalStore, creatorStore, accountStore, opportunityStateStore, now = new Date() }) {
  const [signals, creators, accountProfile, states] = await Promise.all([
    signalStore.list(), creatorStore.list(), accountStore.get(), opportunityStateStore.list(),
  ]);
  const discovery = buildDiscovery({ signals, creators, now });
  const matching = buildMatching({ discovery, signals, accountProfile, now });
  const decisions = buildDecisions({ discovery, matching });
  const opportunities = buildOpportunities({ discovery, decisions, signals, states });
  return { signals, creators, accountProfile, discovery, matching, decisions, opportunities };
}
