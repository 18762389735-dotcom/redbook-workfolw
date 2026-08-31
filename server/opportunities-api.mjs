import { json, readJsonBody } from './http-json.mjs';
import { buildDerivedPipeline } from './derived-pipeline.mjs';

export function createOpportunitiesApiHandler(stores) {
  return async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    try {
      if (request.method === 'GET' && pathname === '/api/opportunities') {
        const pipeline = await buildDerivedPipeline(stores);
        return json(response, 200, { generatedAt: pipeline.decisions.generated_at, opportunities: pipeline.opportunities });
      }
      if (request.method === 'POST' && pathname === '/api/opportunities/evaluate') {
        const { signalId } = await readJsonBody(request);
        const signal = (await stores.signalStore.list()).find((item) => item.id === signalId);
        if (!signal) return json(response, 404, { error: 'Signal 不存在' });
        if (!stores.opportunityEvaluationStore) return json(response, 503, { error: '机会评估存储未配置' });
        const evaluation = await stores.opportunityEvaluationStore.evaluate(signal.id);
        const pipeline = await buildDerivedPipeline(stores);
        const opportunity = pipeline.opportunities.find((item) => item.signalId === signal.id || item.evidenceSignalIds?.includes(signal.id));
        return json(response, evaluation.created ? 201 : 200, { ...evaluation, opportunity });
      }
      if (request.method === 'POST' && pathname.startsWith('/api/opportunities/') && pathname.endsWith('/action')) {
        const opportunityId = decodeURIComponent(pathname.slice('/api/opportunities/'.length, -'/action'.length));
        const before = await buildDerivedPipeline(stores);
        const opportunity = before.opportunities.find((item) => item.id === opportunityId || item.clusterId === opportunityId);
        if (!opportunity) return json(response, 404, { error: 'Opportunity 不存在' });
        const decision = before.decisions.decisions.find((item) => item.signal.cluster_id === opportunity.clusterId) || {
          decision_id: `decision:${opportunity.stateKey || opportunity.id}`,
          status: opportunity.decisionStatus,
          limitations: opportunity.limitations,
          missing_evidence: opportunity.missingEvidence,
          privacy_constraints: opportunity.privacyConstraints,
          next_step: opportunity.nextStep,
        };
        const { action } = await readJsonBody(request);
        await stores.opportunityStateStore.applyAction(opportunity.stateKey || opportunity.clusterId, action, decision);
        const after = await buildDerivedPipeline(stores);
        return json(response, 200, after.opportunities.find((item) => item.id === opportunity.id));
      }
      return json(response, 404, { error: '接口不存在' });
    } catch (error) {
      return json(response, 400, { error: error.message || '机会操作失败' });
    }
  };
}
