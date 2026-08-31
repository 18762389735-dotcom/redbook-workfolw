export async function requestJson(path, options) { const response = await fetch(path, { headers: { 'content-type': 'application/json' }, ...options }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || '请求未完成'); return payload; }
export const listSignals = () => requestJson('/api/signals');
export const listCreators = () => requestJson('/api/creators');
export const getDiscovery = () => requestJson('/api/discovery');
export const getAccount = () => requestJson('/api/account');
export const updateAccount = (profile) => requestJson('/api/account', { method: 'PUT', body: JSON.stringify(profile) });
export const getMatching = () => requestJson('/api/matching');
export const getDecisions = () => requestJson('/api/decisions');
export const getOpportunities = () => requestJson('/api/opportunities');
export const evaluateOpportunity = (signalId) => requestJson('/api/opportunities/evaluate', { method: 'POST', body: JSON.stringify({ signalId }) });
export const actOnOpportunity = (id, action) => requestJson(`/api/opportunities/${encodeURIComponent(id)}/action`, { method: 'POST', body: JSON.stringify({ action }) });
export const getWritingWorkspace = () => requestJson('/api/writing');
export const createWritingDraft = (opportunityId) => requestJson('/api/writing/drafts', { method: 'POST', body: JSON.stringify({ opportunityId }) });
export const updateWritingDraft = (id, draft) => requestJson(`/api/writing/drafts/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(draft) });
export const createPublishRecord = (record) => requestJson('/api/publish-records', { method: 'POST', body: JSON.stringify(record) });
export const getReview = () => requestJson('/api/review');
export const updatePublishRecord = (id, record) => requestJson(`/api/publish-records/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(record) });
