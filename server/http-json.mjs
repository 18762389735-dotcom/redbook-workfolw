export function json(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  if (status === 204) return response.end();
  response.end(JSON.stringify(value));
}

export async function readJsonBody(request, limit = 1_000_000) {
  let text = '';
  for await (const part of request) {
    text += part;
    if (text.length > limit) throw new Error('请求体过大');
  }
  return JSON.parse(text || '{}');
}
