import { createSignal } from '../../core/signals/schema.mjs';

const pick = (object, keys) => keys.map((key) => object?.[key]).find((value) => value !== undefined && value !== null && value !== '');
const epochToIso = (value) => typeof value === 'number' && value > 0 ? new Date(value < 10_000_000_000 ? value * 1000 : value).toISOString() : typeof value === 'string' ? value : null;

const metricLabel = '(?:赞|点赞|收藏|评论|分享|转发|粉丝)?';

export function parseMetric(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\s+/g, '');
  if (!normalized || normalized === '暂无') return null;

  const unitMatch = normalized.match(new RegExp(`^(\\d+(?:\\.\\d+)?)(万|千)${metricLabel}$`));
  if (unitMatch) {
    const multiplier = unitMatch[2] === '万' ? 10_000 : 1_000;
    const parsed = Number(unitMatch[1]) * multiplier;
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
  }

  const integerMatch = normalized.match(new RegExp(`^((?:\\d{1,3}(?:,\\d{3})+)|\\d+)${metricLabel}$`));
  if (!integerMatch) return null;
  const parsed = Number(integerMatch[1].replaceAll(',', ''));
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

// Adapter boundary: no code beyond this module consumes a Beav or XHS response shape.
export function normalizeXiaohongshuSignal(raw, source = {}) {
  const card = raw?.note_card || raw?.noteCard || raw?.note || raw;
  const user = card?.user || card?.author || raw?.user || {};
  const interaction = card?.interact_info || {};
  const noteId = pick(card, ['note_id', 'noteId', 'id']) || pick(raw, ['note_id', 'noteId']);
  return createSignal({
    noteId: noteId && String(noteId), url: pick(card, ['url', 'noteUrl']), title: pick(card, ['title', 'name']), bodyText: pick(card, ['desc', 'description', 'content', 'bodyText']),
    author: { id: pick(user, ['user_id', 'userId', 'id']), name: pick(user, ['nickname', 'name']), profileUrl: pick(user, ['profile_url', 'profileUrl']), followerCount: parseMetric(pick(user, ['follower_count', 'followerCount', 'fans'])) },
    metrics: { likes: parseMetric(pick(card, ['liked_count', 'likedCount', 'like_count', 'likes']) ?? card?.metrics?.likes ?? interaction.liked_count), favorites: parseMetric(pick(card, ['collected_count', 'collectedCount', 'favorite_count', 'favorites']) ?? card?.metrics?.favorites ?? interaction.collected_count), comments: parseMetric(pick(card, ['comment_count', 'commentCount', 'comments']) ?? card?.metrics?.comments ?? interaction.comment_count), shares: parseMetric(pick(card, ['share_count', 'shareCount', 'shares']) ?? card?.metrics?.shares ?? interaction.share_count) },
    media: { cover: pick(card?.cover, ['url_default', 'url_pre', 'url']) || pick(card, ['cover']) || pick(card?.media, ['cover']), images: Array.isArray(card?.image_list) ? card.image_list.map((item) => pick(item, ['url_default', 'url_pre', 'url'])).filter(Boolean) : Array.isArray(card?.media?.images) ? card.media.images : [], type: pick(card, ['type', 'mediaType']) || pick(card?.media, ['type']) },
    publishedAt: epochToIso(pick(card, ['time', 'publish_time', 'publishedAt'])), capturedAt: source.capturedAt || card.capturedAt, source: { provider: source.provider || 'beav-derived-browser-extension', method: source.method || 'visible-notes', keyword: source.keyword, taskId: source.taskId },
  });
}
