function median(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function assessOutlier(target, signals, creators, now = new Date()) {
  const authorId = target?.author?.id || null;
  const creator = authorId ? creators.find((item) => item.userId === authorId) : null;
  const followerCount = creator?.metrics?.followers ?? target?.author?.followerCount ?? null;
  const baselineSignals = authorId ? signals.filter((signal) => (
    signal.author?.id === authorId
    && signal.noteId !== target.noteId
    && signal.source?.method === 'creator-baseline'
    && Number.isFinite(signal.metrics?.likes)
  )) : [];
  const recentLikes = baselineSignals.map((signal) => signal.metrics.likes);
  const medianLikes = median(recentLikes);
  const targetLikes = Number.isFinite(target?.metrics?.likes) ? target.metrics.likes : null;
  const ratio = targetLikes === null || medianLikes === null ? null : Number((targetLikes / Math.max(medianLikes, 10)).toFixed(2));
  const missingEvidence = [];
  if (!authorId) missingEvidence.push('author_id');
  if (!creator) missingEvidence.push('creator_snapshot');
  if (followerCount === null) missingEvidence.push('follower_count');
  if (targetLikes === null) missingEvidence.push('target_likes');
  if (baselineSignals.length < 3) missingEvidence.push('creator_baseline_min_3');

  let status = 'insufficient';
  if (targetLikes !== null && baselineSignals.length >= 3) status = ratio >= 5 ? 'observed' : 'not_observed';
  const confidence = status === 'insufficient' ? 'unknown' : followerCount === null ? 'low' : 'medium';
  const reasons = status === 'observed'
    ? [`当前 ${targetLikes} 赞，相对作者近期 ${baselineSignals.length} 篇有效样本中位数 ${medianLikes} 赞，为 ${ratio}×。`]
    : status === 'not_observed'
      ? [`当前 ${targetLikes} 赞，相对作者近期中位数 ${medianLikes} 赞，为 ${ratio}×，未达到 5× 阈值。`]
      : [targetLikes === null ? '当前笔记点赞数据缺失。' : `作者近期有效基线仅 ${baselineSignals.length} 篇，至少需要 3 篇。`];

  return {
    signalId: target?.id || null,
    authorId,
    status,
    confidence,
    targetLikes,
    followerCount,
    baseline: {
      sampleCount: baselineSignals.length,
      medianLikes,
      ratio,
      sampleSignalIds: baselineSignals.map((signal) => signal.id),
    },
    missingEvidence,
    reasons,
    derivedAt: new Date(now).toISOString(),
  };
}
