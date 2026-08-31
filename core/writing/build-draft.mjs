const list = (value) => Array.isArray(value) ? value : [];
const text = (value, fallback = '') => value === null || value === undefined || String(value).trim() === '' ? fallback : String(value).trim();

function evidenceView(signal) {
  return {
    id: signal.id,
    noteId: signal.noteId,
    title: text(signal.title, '未命名笔记'),
    bodyText: text(signal.bodyText, ''),
    url: signal.url || null,
    author: {
      id: signal.author?.id || null,
      name: signal.author?.name || null,
    },
    metrics: {
      likes: Number.isFinite(signal.metrics?.likes) ? signal.metrics.likes : null,
      favorites: Number.isFinite(signal.metrics?.favorites) ? signal.metrics.favorites : null,
      comments: Number.isFinite(signal.metrics?.comments) ? signal.metrics.comments : null,
      shares: Number.isFinite(signal.metrics?.shares) ? signal.metrics.shares : null,
    },
    publishedAt: signal.publishedAt || null,
    capturedAt: signal.capturedAt || null,
    source: signal.source ? { provider: signal.source.provider || null, method: signal.source.method || null } : null,
  };
}

function titleCandidates(topic, evidence) {
  const firstEvidence = evidence[0]?.title;
  return [
    `${topic}：从真实案例里提炼可执行方法`,
    `关于${topic}，先看这${evidence.length || 1}条真实观察`,
    `${topic}怎么做？一份基于案例的拆解`,
    firstEvidence ? `从「${firstEvidence}」看${topic}` : `${topic}：我的实践记录`,
    `把${topic}讲清楚：给正在尝试的人`,
  ].slice(0, 5);
}

function structureFor(topic) {
  return [
    `开场：提出${topic}相关的具体问题或使用场景`,
    '证据：引用真实 Signal，说明观察到的现象',
    '拆解：提炼 2–3 个可复用的方法或判断点',
    '行动：给读者一个今天可以尝试的小步骤',
    '收束：说明适用边界，并邀请读者分享经验',
  ];
}

function metricSummary(metrics = {}) {
  const labels = [['likes', '赞'], ['favorites', '收藏'], ['comments', '评论'], ['shares', '分享']];
  return labels.filter(([key]) => Number.isFinite(metrics[key])).map(([key, label]) => `${label} ${metrics[key]}`).join('，');
}

export function buildWritingBrief({ opportunity, signals = [], accountProfile = {}, now = new Date() } = {}) {
  if (!opportunity?.id) throw new TypeError('Opportunity 是必填字段');
  const signalById = new Map((Array.isArray(signals) ? signals : []).map((signal) => [signal.id, signal]));
  const profile = accountProfile && typeof accountProfile === 'object' ? accountProfile : {};
  const evidence = list(opportunity.evidenceSignalIds).map((id) => signalById.get(id)).filter(Boolean).map(evidenceView);
  const audience = text(profile.targetAudience) || text(profile.niche) || '目标受众尚未在账号资料中确认';
  const accountPositioning = text(profile.positioning) || text(profile.displayName) || '当前账号定位尚未填写';
  const topic = text(opportunity.title, '待确认选题');
  const reasons = [...list(opportunity.whyNow), ...list(opportunity.whyFit)];
  const constraints = [...list(opportunity.blockingFactors), ...list(opportunity.missingEvidence), ...list(opportunity.privacyConstraints)];
  return {
    id: `brief:${opportunity.id}`,
    opportunityId: opportunity.id,
    createdAt: new Date(now).toISOString(),
    topic,
    whyWorthDoing: reasons.length ? [...new Set(reasons)] : ['当前机会已有平台证据，仍需结合账号实际情况人工判断。'],
    evidence,
    targetAudience: audience,
    accountFit: {
      status: opportunity.accountFit?.status || 'unknown',
      positioning: accountPositioning,
      reasons: list(opportunity.whyFit),
    },
    titleCandidates: titleCandidates(topic, evidence),
    structure: structureFor(topic),
    constraints,
    decisionStatus: opportunity.decisionStatus || null,
    confidence: opportunity.confidence || opportunity.matchingConfidence || 'unknown',
    evidenceCompleteness: opportunity.evidenceCompleteness || null,
    missingEvidence: [...list(opportunity.missingEvidence)],
    matchingConfidence: opportunity.matchingConfidence || null,
  };
}

export function buildDraftFromBrief(brief, now = new Date()) {
  if (!brief?.opportunityId || !brief.topic) throw new TypeError('Brief 不完整');
  const evidence = list(brief.evidence).filter((signal) => signal && typeof signal === 'object');
  const reasons = list(brief.whyWorthDoing);
  const candidates = list(brief.titleCandidates);
  const evidenceLines = evidence.length
    ? evidence.map((signal, index) => {
      const metrics = metricSummary(signal.metrics);
      const author = signal.author?.name ? `作者：${signal.author.name}` : '作者资料暂无';
      const source = signal.url ? `来源：${signal.url}` : '来源链接暂无';
      return `${index + 1}. 《${signal.title}》\n${author}${metrics ? `；${metrics}` : ''}\n${source}`;
    }).join('\n')
    : '当前没有可引用的 Signal，请先补充真实平台证据。';
  const body = [
    `最近我在关注「${brief.topic}」。`,
    '',
    '这件事为什么值得做',
    ...reasons.map((reason) => `- ${reason}`),
    '',
    '真实观察依据',
    evidenceLines,
    '',
    '正文草稿',
    `如果你也在面对${brief.topic}，可以先从一个具体场景开始记录。`,
    '第一步，描述你遇到的真实问题；第二步，说明你尝试过什么；第三步，留下可以复用的小方法。',
    '这份草稿只根据当前 Signal 做了结构化整理，个人经历、结论和边界请在发布前补充确认。',
  ].join('\n');
  return {
    id: `draft:${brief.opportunityId}`,
    opportunityId: brief.opportunityId,
    status: 'draft',
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    brief,
    title: candidates[0] || brief.topic,
    body,
    references: evidence.map((signal) => signal.id),
  };
}
