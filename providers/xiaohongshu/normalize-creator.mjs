import { createCreatorSnapshot } from '../../core/creators/schema.mjs';
import { parseMetric } from './normalize.mjs';

const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;

function observedProfileUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    if (!/(^|\.)(xiaohongshu\.com|rednote\.com)$/i.test(parsed.hostname)) return null;
    if (!/^\/user\/profile\//i.test(parsed.pathname)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function normalizeXiaohongshuCreator(raw, source = {}) {
  const stats = raw?.stats && typeof raw.stats === 'object' ? raw.stats : {};
  return createCreatorSnapshot({
    userId: text(raw?.userId || raw?.user_id || raw?.id),
    name: text(raw?.nickname || raw?.name),
    profileUrl: observedProfileUrl(raw?.profileUrl || raw?.source),
    description: text(raw?.description || raw?.desc),
    avatar: text(raw?.avatar),
    metrics: {
      followers: parseMetric(stats.followers ?? stats.fans ?? raw?.followers ?? raw?.fans),
      following: parseMetric(stats.following ?? stats.follows ?? raw?.following ?? raw?.follows),
      likesAndCollects: parseMetric(stats.likesAndCollects ?? stats.liked ?? raw?.likesAndCollects ?? raw?.liked),
    },
    capturedAt: source.capturedAt || raw?.capturedAt,
    source: {
      provider: source.provider || 'beav-derived-browser-extension',
      method: source.method || 'creator-profile',
      taskId: source.taskId,
    },
  });
}
