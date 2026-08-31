// Redbook-owned thin transport adapter.
// Donor collector code remains responsible for extraction, validation, queueing,
// interval control, and task lifecycle. This module only forwards donor output
// to the local Redbook connector when the desktop app is available.

const CONNECTOR_BASE = 'http://127.0.0.1:43127';
const CONNECTOR_HEADER = 'beav-v1';

function redbookOptions(options = {}) {
  return {
    method: options.method || 'current-note',
    taskId: options.taskId || null,
    capturedAt: options.capturedAt || null,
    ...(options.creatorUserId ? { creatorUserId: options.creatorUserId } : {}),
    ...(options.creatorNickname ? { creatorNickname: options.creatorNickname } : {}),
  };
}

async function request(path, body) {
  const response = await fetch(`${CONNECTOR_BASE}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined
      ? { 'X-Redbook-Connector': CONNECTOR_HEADER }
      : { 'Content-Type': 'application/json', 'X-Redbook-Connector': CONNECTOR_HEADER },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Redbook connector ${response.status}`);
  return result;
}

export async function health() {
  try { return await request('/health'); }
  catch (error) { return { ok: false, service: 'redbook-beav-connector', version: 1, error: error instanceof Error ? error.message : String(error) }; }
}

export async function ingestNote(payload, options = {}) {
  try {
    return await request('/v1/xhs/note', {
      payload,
      __redbook: redbookOptions(options),
    });
  }
  catch (error) { return { success: false, connected: false, error: error instanceof Error ? error.message : String(error), method: options.method || 'current-note' }; }
}

export async function ingestCreator(payload, options = {}) {
  try {
    return await request('/v1/xhs/creator', {
      payload,
      __redbook: { ...redbookOptions({ ...options, method: options.method || 'creator-profile' }) },
    });
  }
  catch (error) { return { success: false, connected: false, error: error instanceof Error ? error.message : String(error) }; }
}

export async function syncAccountProfile(payload, options = {}) {
  try {
    return await request('/v1/xhs/account', {
      payload,
      __redbook: { ...redbookOptions({ ...options, method: options.method || 'creator-profile' }) },
    });
  }
  catch (error) { return { success: false, connected: false, error: error instanceof Error ? error.message : String(error) }; }
}

export async function ingestNotes(payloads, options = {}) {
  try {
    return await request('/v1/xhs/notes', {
      notes: Array.isArray(payloads) ? payloads : payloads?.notes,
      __redbook: { ...redbookOptions({ ...options, method: options.method || 'creator-baseline' }) },
    });
  }
  catch (error) { return { success: false, connected: false, error: error instanceof Error ? error.message : String(error) }; }
}
