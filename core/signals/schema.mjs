import { randomUUID } from 'node:crypto';

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const number = (value) => Number.isFinite(value) && value >= 0 ? value : null;

export function createSignal(input, now = new Date().toISOString()) {
  if (!isObject(input)) throw new TypeError('signal 必须是对象');
  const noteId = text(input.noteId);
  if (!noteId) throw new TypeError('signal.noteId 是必填字段');
  const author = isObject(input.author) ? input.author : {};
  const metrics = isObject(input.metrics) ? input.metrics : {};
  const media = isObject(input.media) ? input.media : {};
  const source = isObject(input.source) ? input.source : {};
  const provider = text(source.provider);
  const method = text(source.method);
  if (!provider || !method) throw new TypeError('signal.source.provider 和 signal.source.method 是必填字段');
  return {
    id: text(input.id) || `xiaohongshu:${noteId}`,
    platform: 'xiaohongshu', noteId, url: text(input.url), title: text(input.title), bodyText: text(input.bodyText),
    author: { id: text(author.id), name: text(author.name), profileUrl: text(author.profileUrl), followerCount: number(author.followerCount) },
    metrics: { likes: number(metrics.likes), favorites: number(metrics.favorites), comments: number(metrics.comments), shares: number(metrics.shares) },
    media: { cover: text(media.cover), images: Array.isArray(media.images) ? media.images.filter(text) : [], type: text(media.type) },
    publishedAt: text(input.publishedAt), capturedAt: text(input.capturedAt) || now,
    source: { provider, method, keyword: text(source.keyword), taskId: text(source.taskId) || randomUUID() },
  };
}

export function comparableSignal(signal) {
  const { capturedAt, id, source, ...platformFacts } = signal;
  return JSON.stringify(platformFacts);
}

// A less complete collector observation must not erase a previously observed
// platform fact. New non-null facts still replace old values and provenance is
// always refreshed by the Store.
export function mergeSignalFacts(existing, incoming) {
  const keep = (next, previous) => next === null || next === undefined ? previous : next;
  return {
    ...incoming,
    id: existing.id,
    url: keep(incoming.url, existing.url),
    title: keep(incoming.title, existing.title),
    bodyText: keep(incoming.bodyText, existing.bodyText),
    author: {
      id: keep(incoming.author.id, existing.author.id),
      name: keep(incoming.author.name, existing.author.name),
      profileUrl: keep(incoming.author.profileUrl, existing.author.profileUrl),
      followerCount: keep(incoming.author.followerCount, existing.author.followerCount),
    },
    metrics: {
      likes: keep(incoming.metrics.likes, existing.metrics.likes),
      favorites: keep(incoming.metrics.favorites, existing.metrics.favorites),
      comments: keep(incoming.metrics.comments, existing.metrics.comments),
      shares: keep(incoming.metrics.shares, existing.metrics.shares),
    },
    media: {
      cover: keep(incoming.media.cover, existing.media.cover),
      images: incoming.media.images.length ? incoming.media.images : existing.media.images,
      type: keep(incoming.media.type, existing.media.type),
    },
    publishedAt: keep(incoming.publishedAt, existing.publishedAt),
  };
}
