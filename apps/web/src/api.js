export async function requestJson(path, options) { const response = await fetch(path, { headers: { 'content-type': 'application/json' }, ...options }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || '请求未完成'); return payload; }
export const listSignals = () => requestJson('/api/signals');
