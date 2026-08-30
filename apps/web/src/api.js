export async function requestJson(path, options) { const response = await fetch(path, { headers: { 'content-type': 'application/json' }, ...options }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || '请求未完成'); return payload; }
export const listSignals = () => requestJson('/api/signals');
export const listCreators = () => requestJson('/api/creators');
export const getDiscovery = () => requestJson('/api/discovery');
export const getAccount = () => requestJson('/api/account');
export const updateAccount = (profile) => requestJson('/api/account', { method: 'PUT', body: JSON.stringify(profile) });
export const getMatching = () => requestJson('/api/matching');
export const getDecisions = () => requestJson('/api/decisions');
export const getOpportunities = () => requestJson('/api/opportunities');
export const actOnOpportunity = (id, action) => requestJson(`/api/opportunities/${encodeURIComponent(id)}/action`, { method: 'POST', body: JSON.stringify({ action }) });
