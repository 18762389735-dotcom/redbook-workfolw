import { buildWritingBrief, buildDraftFromBrief } from '../core/writing/build-draft.mjs';
import { buildDerivedPipeline } from './derived-pipeline.mjs';
import { json, readJsonBody } from './http-json.mjs';

export function createWritingApiHandler(stores, pipelineBuilder = buildDerivedPipeline) {
  return async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const pathname = url.pathname;
    try {
      if (request.method === 'GET' && pathname === '/api/writing') {
        const [drafts, pipeline] = await Promise.all([stores.draftStore.list(), pipelineBuilder(stores)]);
        const selectedOpportunity = pipeline.opportunities.find((item) => item.userState === 'selected') || null;
        return json(response, 200, { drafts, selectedOpportunity });
      }

      if (request.method === 'POST' && pathname === '/api/writing/drafts') {
        const { opportunityId } = await readJsonBody(request);
        if (typeof opportunityId !== 'string' || !opportunityId.trim()) return json(response, 400, { error: 'opportunityId 是必填字段' });
        const pipeline = await pipelineBuilder(stores);
        const opportunity = pipeline.opportunities.find((item) => item.id === opportunityId || item.clusterId === opportunityId);
        if (!opportunity) return json(response, 404, { error: 'Opportunity 不存在' });
        if (opportunity.userState !== 'selected') return json(response, 409, { error: '请先在机会页选择这个机会' });
        const existing = await stores.draftStore.getByOpportunityId(opportunity.id);
        if (existing) return json(response, 200, { draft: existing, created: false });
        const brief = buildWritingBrief({ opportunity, signals: pipeline.signals, accountProfile: pipeline.accountProfile });
        const draft = buildDraftFromBrief(brief);
        const result = await stores.draftStore.createIfMissing(draft);
        return json(response, 201, result);
      }

      if (request.method === 'PUT' && pathname.startsWith('/api/writing/drafts/')) {
        const id = decodeURIComponent(pathname.slice('/api/writing/drafts/'.length));
        const updated = await stores.draftStore.update(id, await readJsonBody(request));
        if (!updated) return json(response, 404, { error: 'Draft 不存在' });
        return json(response, 200, { draft: updated });
      }

      return json(response, 404, { error: '接口不存在' });
    } catch (error) {
      return json(response, 400, { error: error.message || '创作数据处理失败' });
    }
  };
}
