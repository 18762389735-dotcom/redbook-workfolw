import { normalizeRecentContent } from './schema.mjs';

const text = (value) => typeof value === 'string' ? value.trim() : '';

const STOP_WORDS = new Set(['小红书', '分享', '我的', '一个', '可以', '如何', '以及', '今天', '真的', '这个', '那个', '记录']);

function termsFrom(value) {
  return text(value)
    .split(/[\s,，。！？；：:、|/\\()[\]【】<>《》“”‘’#]+/)
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
  const themes = topTerms(usableNotes);
  const formats = formatsFor(usableNotes);
  const highPerforming = highPerformingThemes(usableNotes, themes);
  const subject = themes.length ? themes.slice(0, 3).join('、') : '已保存的小红书内容';
  const inferred = {
    positioning: usableNotes.length ? `围绕${subject}分享真实经验与方法` : '',
    niche: themes.slice(0, 3).join('、'),
    targetAudience: themes.length ? `关注${subject}的读者` : '',
    contentPillars: themes.slice(0, 3),
    accountPromise: usableNotes.length ? [`用真实经验分享${subject}相关的方法与观察`] : [],
    strengths: [
      ...(usableNotes.length >= 3 ? ['已有持续的真实内容记录'] : []),
      ...(themes.length ? [`内容主题集中在${themes.slice(0, 3).join('、')}`] : []),
      ...(formats.length ? [`已出现${formats.join('、')}内容形式`] : []),
    ],
    weaknesses: usableNotes.length < 5 ? ['可用于分析的近期笔记较少，画像置信度有限'] : [],
    contentBoundaries: [],
    profileConfidence: usableNotes.length >= 5 ? 'medium' : 'low',
    topics: themes,
    recurringThemes: themes,
    contentFormats: formats,
    highPerformingThemes: highPerforming,
    source: 'ai_profile_analysis',
    type: 'inferred',
    analyzedAt: now,
    noteCount: usableNotes.length,
  };
  return { ...inferred, recentContent, accountName: text(facts.accountName), xhsId: text(facts.xhsId) };
}

export function analysisFieldMetadata(now = new Date().toISOString()) {
  return Object.fromEntries([
    'positioning', 'niche', 'targetAudience', 'contentPillars', 'accountPromise', 'strengths', 'weaknesses', 'contentBoundaries',
  ].map((field) => [field, { source: 'ai_profile_analysis', type: 'inferred', updatedAt: now }]));
}
