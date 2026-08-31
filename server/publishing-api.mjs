import { json, readJsonBody } from './http-json.mjs';

export function createPublishingApiHandler(stores) {
  return async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    try {
      if (request.method === 'GET' && pathname === '/api/review') return json(response, 200, { records: await stores.publishRecordStore.list() });
      if (request.method === 'POST' && pathname === '/api/publish-records') {
        const result = await stores.publishRecordStore.create(await readJsonBody(request));
        return json(response, result.created ? 201 : 200, result);
      }
      if (request.method === 'PUT' && pathname.startsWith('/api/publish-records/')) {
        const id = decodeURIComponent(pathname.slice('/api/publish-records/'.length));
        const record = await stores.publishRecordStore.update(id, await readJsonBody(request));
        return record ? json(response, 200, { record }) : json(response, 404, { error: '发布记录不存在' });
      }
      return json(response, 404, { error: '接口不存在' });
    } catch (error) {
      return json(response, 400, { error: error.message || '发布记录处理失败' });
    }
  };
}
