import { normalizeRecentContent } from './schema.mjs';

const text = (value) => typeof value === 'string' ? value.trim() : '';

const STOP_WORDS = new Set(['小红书', '分享', '我的', '一个', '可以', '如何', '以及', '今天', '真的', '这个', '那个', '记录']);

function termsFrom(value) {
  return text(value)
    .split(/[\s,，。！？；：:、|｜→/\\()[\]【】<>《》“”‘’#]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2 && term.length <= 20 && !STOP_WORDS.has(term));
}

function topTerms(notes) {
  const counts = new Map();
  for (const note of notes) {
    const seen = new Set(termsFrom(`${note.title || ''} ${note.bodyText || ''}`));
    for (const term of seen) counts.set(term, (counts.get(term) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([term]) => term);
}

function formatsFor(notes) {
  const rules = [
    ['教程/方法', /教程|方法|步骤|指南|清单|攻略/],
    ['经验记录', /经验|记录|日常|复盘|心得|plog/i],
    ['工具测评', /测评|评测|工具|软件|效率/],
    ['学习成长', /学习|备考|考研|成长|读书/],
  ];
  return rules.filter(([, pattern]) => notes.some((note) => pattern.test(`${note.title || ''} ${note.bodyText || ''}`))).map(([label]) => label);
}

function highPerformingThemes(notes, themes) {
  const likes = notes.map((note) => Number(note.metrics?.likes)).filter(Number.isFinite).sort((a, b) => a - b);
  if (!likes.length || !themes.length) return [];
  const median = likes[Math.floor(likes.length / 2)];
  return notes
    .filter((note) => Number(note.metrics?.likes) >= median)
    .flatMap((note) => termsFrom(`${note.title || ''} ${note.bodyText || ''}`))
    .filter((term, index, values) => values.indexOf(term) === index && themes.includes(term))
    .slice(0, 3);
}

/**
 * Builds an explainable first-pass profile from public facts and saved notes.
 * This intentionally does not call an AI provider or invent missing facts.
 */
export function buildAccountProfileAnalysis({ facts = {}, notes = [], now = new Date().toISOString() } = {}) {
  const recentContent = normalizeRecentContent(notes, now);
  const usableNotes = recentContent.notes.filter((note) => note.noteId || note.title || note.bodyText);
  const factEvidence = [facts.bio, facts.school, ...(Array.isArray(facts.publicTags) ? facts.publicTags : [])]
    .map(text)
    .filter(Boolean)
    .join(' ');
  const factNotes = factEvidence ? [{ title: '', bodyText: factEvidence }] : [];
  // A profile without saved notes still has a small, honest evidence surface:
  // the public bio/tags. Keep it separate from note performance analysis.
  const inferenceNotes = usableNotes.length ? usableNotes : factNotes;
  const themes = topTerms(inferenceNotes);
  const formats = formatsFor(inferenceNotes);
  const highPerforming = highPerformingThemes(usableNotes, themes);
  const hasOwnNotes = usableNotes.length > 0;
  const hasPublicFacts = factNotes.length > 0;
  const subject = themes.length
    ? themes.slice(0, 3).join('、')
    : hasOwnNotes
      ? '已保存的小红书内容'
      : '主页公开资料';
  const contentPillars = themes.slice(0, 3).length
    ? themes.slice(0, 3)
    : hasPublicFacts
      ? ['主页公开资料']
      : [];
  const inferred = {
    positioning: hasOwnNotes
      ? `围绕${subject}分享真实经验与方法`
      : hasPublicFacts
        ? `围绕${subject}分享个人经验与观察`
        : '',
    niche: themes.slice(0, 3).join('、') || (hasPublicFacts ? '主页公开资料' : ''),
    targetAudience: (themes.length || hasPublicFacts) ? `关注${subject}的读者` : '',
    contentPillars,
    accountPromise: hasOwnNotes
      ? [`用真实经验分享${subject}相关的方法与观察`]
      : hasPublicFacts
        ? [`基于主页公开资料分享${subject}相关的经验与观察`]
        : [],
    strengths: [
      ...(usableNotes.length >= 3 ? ['已有持续的真实内容记录'] : []),
      ...(themes.length ? [`内容主题集中在${themes.slice(0, 3).join('、')}`] : []),
      ...(formats.length ? [`已出现${formats.join('、')}内容形式`] : []),
      ...(!hasOwnNotes && hasPublicFacts ? ['主页简介与公开标签提供了初始定位线索'] : []),
    ],
    weaknesses: !hasOwnNotes
      ? ['尚无已保存的本人笔记，内容表现与主题稳定性暂不可验证']
      : usableNotes.length < 5
        ? ['可用于分析的近期笔记较少，画像置信度有限']
        : [],
    contentBoundaries: [],
    profileConfidence: usableNotes.length >= 5 ? 'medium' : 'low',
    missingEvidence: hasOwnNotes ? [] : ['own_content_history_missing'],
    topics: themes,
    recurringThemes: themes,
    contentFormats: formats,
    highPerformingThemes: highPerforming,
    source: 'ai_profile_analysis',
    type: 'inferred',
    analyzedAt: now,
    noteCount: usableNotes.length,
  };
  return {
    ...inferred,
    recentContent,
    accountName: text(facts.accountName),
    userId: text(facts.userId),
    xhsId: text(facts.xhsId),
  };
}

export function analysisFieldMetadata(now = new Date().toISOString()) {
  return Object.fromEntries([
    'positioning', 'niche', 'targetAudience', 'contentPillars', 'accountPromise', 'strengths', 'weaknesses', 'contentBoundaries',
  ].map((field) => [field, { source: 'ai_profile_analysis', type: 'inferred', updatedAt: now }]));
}
