import { ingestCreators } from '../core/creators/ingest-creators.mjs';

const json = (response, status, value) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
};

const readBody = async (request) => {
  let text = '';
  for await (const part of request) {
    text += part;
    if (text.length > 1_000_000) throw new Error('请求体过大');
  }
  return JSON.parse(text || '{}');
};

export function createCreatorsApiHandler(store) {
  return async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    try {
      if (request.method === 'OPTIONS') {
        response.writeHead(204, { 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' });
        return response.end();
      }
      if (request.method === 'GET' && url.pathname === '/api/creators') return json(response, 200, { creators: await store.list() });
      if (request.method === 'GET' && url.pathname.startsWith('/api/creators/')) {
        const creator = await store.get(decodeURIComponent(url.pathname.slice(14)));
        return creator ? json(response, 200, creator) : json(response, 404, { error: 'Creator 不存在' });
      }
      if (request.method === 'POST' && url.pathname === '/api/creators/ingest') return json(response, 200, await ingestCreators(store, await readBody(request)));
      return json(response, 404, { error: '接口不存在' });
    } catch (error) {
      return json(response, 400, { error: error.message || '请求未完成' });
    }
  };
}
