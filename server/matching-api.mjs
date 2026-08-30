import { json } from './http-json.mjs';
import { buildDerivedPipeline } from './derived-pipeline.mjs';

export function createMatchingApiHandler(stores) {
  return async (request, response) => {
    if (request.method !== 'GET') return json(response, 405, { error: '不支持的请求方法' });
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const pipeline = await buildDerivedPipeline(stores);
    if (pathname === '/api/matching') return json(response, 200, pipeline.matching);
    if (pathname === '/api/decisions') return json(response, 200, pipeline.decisions);
    return json(response, 404, { error: '接口不存在' });
  };
}
