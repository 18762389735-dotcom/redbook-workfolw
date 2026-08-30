import { createSignal } from '../../core/signals/schema.mjs';

const pick = (object, keys) => keys.map((key) => object?.[key]).find((value) => value !== undefined && value !== null && value !== '');
const metric = (value) => typeof value === 'number' ? value : null;
const epochToIso = (value) => typeof value === 'number' && value > 0 ? new Date(value < 10_000_000_000 ? value * 1000 : value).toISOString() : typeof value === 'string' ? value : null;

// Adapter boundary: no code beyond this module consumes a Beav or XHS response shape.
export function normalizeXiaohongshuSignal(raw, source = {}) {
  const card = raw?.note_card || raw?.noteCard || raw?.note || raw;
  const user = card?.user || card?.author || raw?.user || {};
  const noteId = pick(card, ['note_id', 'noteId', 'id']) || pick(raw, ['note_id', 'noteId']);
  return createSignal({
    noteId: noteId && String(noteId), url: pick(card, ['url', 'noteUrl']), title: pick(card, ['title', 'name']), bodyText: pick(card, ['desc', 'description', 'content', 'bodyText']),
    author: { id: pick(user, ['user_id', 'userId', 'id']), name: pick(user, ['nickname', 'name']), profileUrl: pick(user, ['profile_url', 'profileUrl']), followerCount: metric(pick(user, ['follower_count', 'followerCount', 'fans'])) },
    metrics: { likes: metric(pick(card, ['liked_count', 'likedCount', 'like_count', 'likes']) ?? card?.metrics?.likes), favorites: metric(pick(card, ['collected_count', 'collectedCount', 'favorite_count', 'favorites']) ?? card?.metrics?.favorites), comments: metric(pick(card, ['comment_count', 'commentCount', 'comments']) ?? card?.metrics?.comments), shares: metric(pick(card, ['share_count', 'shareCount', 'shares']) ?? card?.metrics?.shares) },
    media: { cover: pick(card?.cover, ['url_default', 'url_pre', 'url']) || pick(card, ['cover']) || pick(card?.media, ['cover']), images: Array.isArray(card?.image_list) ? card.image_list.map((item) => pick(item, ['url_default', 'url_pre', 'url'])).filter(Boolean) : Array.isArray(card?.media?.images) ? card.media.images : [], type: pick(card, ['type', 'mediaType']) || pick(card?.media, ['type']) },
    publishedAt: epochToIso(pick(card, ['time', 'publish_time', 'publishedAt'])), capturedAt: source.capturedAt || card.capturedAt, source: { provider: source.provider || 'beav-derived-browser-extension', method: source.method || 'visible-notes', keyword: source.keyword, taskId: source.taskId },
  });
}
