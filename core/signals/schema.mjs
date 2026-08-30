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
  const { capturedAt, id, ...content } = signal;
  return JSON.stringify(content);
}
