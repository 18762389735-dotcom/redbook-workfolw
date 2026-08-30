const DAY_MS = 24 * 60 * 60 * 1000;

export function classifyPublishedAt(publishedAt, now = new Date()) {
  const currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const publishedTime = publishedAt ? new Date(publishedAt).getTime() : Number.NaN;
  if (!Number.isFinite(currentTime) || !Number.isFinite(publishedTime)) return { bucket: 'unknown', ageDays: null };
  const ageDays = Math.floor((currentTime - publishedTime) / DAY_MS);
  return { bucket: ageDays <= 30 ? 'current' : 'reference', ageDays };
}
