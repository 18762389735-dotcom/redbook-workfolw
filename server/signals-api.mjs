import { ingestSignals } from '../core/signals/ingest-signals.mjs';

const json = (response, status, value) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' });
  if (status === 204) return response.end();
  response.end(JSON.stringify(value));
};

const readBody = async (request) => {
  let text = '';
  for await (const part of request) {
    text += part;
    if (text.length > 5_000_000) throw new Error('请求体过大');
  }
  return JSON.parse(text || '{}');
};

export function createSignalsApiHandler(store) {
  return async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    try {
      if (request.method === 'OPTIONS') {
        response.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS', 'access-control-allow-headers': 'content-type' });
        return response.end();
      }
      if (request.method === 'GET' && url.pathname === '/api/signals') return json(response, 200, await store.listWithMetadata());
      if (request.method === 'GET' && url.pathname.startsWith('/api/signals/')) {
        const signal = await store.get(decodeURIComponent(url.pathname.slice(13)));
        return signal ? json(response, 200, signal) : json(response, 404, { error: 'Signal 不存在' });
      }
      if (request.method === 'POST' && url.pathname === '/api/signals/ingest') return json(response, 200, await ingestSignals(store, await readBody(request)));
      if (request.method === 'DELETE' && url.pathname.startsWith('/api/signals/')) return await store.delete(decodeURIComponent(url.pathname.slice(13))) ? json(response, 204) : json(response, 404, { error: 'Signal 不存在' });
      return json(response, 404, { error: '接口不存在' });
    } catch (error) {
      return json(response, 400, { error: error.message || '请求未完成' });
    }
  };
}
