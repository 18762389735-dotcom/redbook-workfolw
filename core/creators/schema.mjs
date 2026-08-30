import { randomUUID } from 'node:crypto';

const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const metric = (value) => Number.isFinite(value) && value >= 0 ? value : null;

export function createCreatorSnapshot(input, now = new Date().toISOString()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('creator 必须是对象');
  const userId = text(input.userId);
  if (!userId) throw new TypeError('creator.userId 是必填字段');
  const metrics = object(input.metrics);
  const source = object(input.source);
  const provider = text(source.provider);
  const method = text(source.method);
  if (!provider || !method) throw new TypeError('creator.source.provider 和 creator.source.method 是必填字段');
  return {
    id: text(input.id) || `xiaohongshu:${userId}`,
    platform: 'xiaohongshu',
    userId,
    name: text(input.name),
    profileUrl: text(input.profileUrl),
    description: text(input.description),
    avatar: text(input.avatar),
    metrics: {
      followers: metric(metrics.followers),
      following: metric(metrics.following),
      likesAndCollects: metric(metrics.likesAndCollects),
    },
    capturedAt: text(input.capturedAt) || now,
    source: {
      provider,
      method,
      taskId: text(source.taskId) || randomUUID(),
    },
  };
}

export function comparableCreator(snapshot) {
  const { id, capturedAt, source, ...platformFacts } = snapshot;
  return JSON.stringify(platformFacts);
}
