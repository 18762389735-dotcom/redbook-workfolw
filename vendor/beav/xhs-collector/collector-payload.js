/*
 * Local derived helper shared by the Chrome fallback and Electron collector.
 * This file is new project code; it is not copied from Beav. It keeps the
 * platform-card traversal and provenance payload construction in one place.
 */
export function extractCandidateCards(records) {
  const found = new Map();
  const visit = (value, seen = new WeakSet()) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    const card = value.note_card || value.noteCard || value.note || value;
    const noteId = card.note_id || card.noteId || card.id;
    if (noteId && (card.title || card.display_title || card.desc || card.user || card.author)) found.set(String(noteId), card);
    for (const child of Object.values(value)) visit(child, seen);
  };
  for (const record of Array.isArray(records) ? records : []) visit(record?.result);
  return [...found.values()];
}

export function buildVisibleSignalPayload(raw, { url, taskId, capturedAt, keyword = null, provider = 'beav-derived-electron-session' } = {}) {
  return {
    ...raw,
    ...(url ? { url } : {}),
    source: { provider, method: 'visible-notes', keyword, taskId, capturedAt },
  };
}

export function buildCreatorSignalPayload(raw, { profileUrl, taskId, capturedAt, provider = 'beav-derived-electron-session' } = {}) {
  return {
    ...raw,
    profileUrl,
    source: { provider, method: 'creator-profile', taskId, capturedAt },
  };
}

export function buildBaselineSignalPayload(raw, { url, taskId, capturedAt, provider = 'beav-derived-electron-session' } = {}) {
  return {
    ...raw,
    ...(url ? { url } : {}),
    source: { provider, method: 'creator-baseline', keyword: null, taskId, capturedAt },
  };
}
