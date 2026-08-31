/*
 * Derived from Jamailar/Beav Plugin/src/background.js (XHS payload outputs).
 * Donor SHA256: 0D5EA8786A0F86F79F3B78B03C4BDD7635FF8A69C3B413BE37FE178418F27DE4
 * License: MIT License - Non-Commercial Use Only.
 * Modification: maps donor-produced payload fields to Redbook's input shapes;
 * it does not inspect the DOM, call platform APIs, or generate identities.
 */

const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;

function safeObservedUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    if (!/(^|\.)(xiaohongshu\.com|rednote\.com)$/i.test(parsed.hostname)) return null;
    return `${parsed.origin}${parsed.pathname}`;
  } catch { return null; }
}

export function beavNotePayloadToSignalInput(payload, source) {
  const noteId = text(payload?.noteId);
  if (!noteId || /^xhs-\d+$/i.test(noteId)) throw new Error('Beav 当前页 payload 未提供可验证的小红书笔记 ID');
  return {
    platform: 'xiaohongshu', noteId, url: safeObservedUrl(payload?.source),
    title: text(payload?.title), bodyText: text(payload?.content || payload?.text),
    author: { id: text(payload?.authorId), name: text(payload?.author), profileUrl: safeObservedUrl(payload?.authorProfileUrl), followerCount: null },
    metrics: { likes: payload?.stats?.likes ?? null, favorites: payload?.stats?.collects ?? null, comments: payload?.stats?.comments ?? null, shares: payload?.stats?.shares ?? null },
    media: { cover: safeObservedUrl(payload?.coverUrl), images: Array.isArray(payload?.images) ? payload.images.map(safeObservedUrl).filter(Boolean) : [], type: text(payload?.noteType) },
    publishedAt: null, capturedAt: source.capturedAt, source,
  };
}

export function beavCreatorPayloadToCreatorInput(payload, source) {
  const userId = text(payload?.userId);
  if (!userId) throw new Error('Beav 博主 payload 未提供 canonical platform userId');
  return {
    userId, nickname: text(payload?.nickname), description: text(payload?.description), avatar: safeObservedUrl(payload?.avatar),
    // Beav's current extractor supplies the canonical ID but no separate safe
    // profile URL on a search overlay. This deterministic canonical route is
    // derived only from that donor-provided ID, never from a handle or nickname.
    profileUrl: `https://www.xiaohongshu.com/user/profile/${encodeURIComponent(userId)}`,
    stats: { fans: payload?.stats?.fans ?? null, follows: payload?.stats?.follows ?? null, liked: payload?.stats?.liked ?? null },
    source: safeObservedUrl(payload?.source), capturedAt: source.capturedAt,
  };
}
