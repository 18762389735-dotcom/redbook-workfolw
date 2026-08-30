import { buildDiscovery } from '../core/discovery/build-discovery.mjs';

export function createDiscoveryApiHandler(signalStore, creatorStore) {
  return async (request, response) => {
    if (request.method !== 'GET' || new URL(request.url, 'http://localhost').pathname !== '/api/discovery') {
      response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
      return response.end(JSON.stringify({ error: '接口不存在' }));
    }
    const result = buildDiscovery({ signals: await signalStore.list(), creators: await creatorStore.list(), now: new Date() });
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(result));
  };
}
