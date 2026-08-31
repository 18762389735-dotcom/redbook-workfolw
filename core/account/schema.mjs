const text = (value) => typeof value === 'string' ? value.trim() : '';

const metric = (value) => {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number(value.replace(/[\s,]/g, ''));
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};

const safeUrl = (value) => {
  try {
    const url = new URL(String(value || ''));
    if (!/(^|\.)(xiaohongshu\.com|rednote\.com)$/i.test(url.hostname)) return null;
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
};

const safeAssetUrl = (value) => {
  try {
    const url = new URL(String(value || ''));
    if (!/^https?:$/i.test(url.protocol)) return null;
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
};

export function sanitizeList(value) {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/\r?\n/) : [];
  return [...new Set(values.map(text).filter(Boolean))];
}

export function normalizeXhsAccountFacts(input = {}, now = new Date().toISOString()) {
  const tags = sanitizeList(input.publicTags || input.tags);
  const school = text(input.school);
  if (school && !tags.includes(school)) tags.push(school);
  return {
    accountName: text(input.accountName || input.nickname || input.name),
    xhsId: text(input.xhsId || input.userId || input.user_id),
    bio: text(input.bio || input.description || input.desc),
    avatar: safeAssetUrl(input.avatar),
    followers: metric(input.followers ?? input.fans),
    following: metric(input.following ?? input.follows),
    likesAndCollects: metric(input.likesAndCollects ?? input.liked),
    school: school || null,
    publicTags: tags,
    profileUrl: safeUrl(input.profileUrl),
    syncedAt: text(input.syncedAt) || now,
    source: 'xhs_profile',
    type: 'fact',
  };
}

export function normalizeRecentContent(notes = [], syncedAt = new Date().toISOString()) {
  const values = Array.isArray(notes) ? notes : [];
  return {
    syncedAt,
    count: values.length,
    notes: values.slice(0, 50).map((note) => ({
      noteId: text(note?.noteId || note?.id || note?.note_id),
      title: text(note?.title || note?.display_title || note?.displayTitle),
      bodyText: text(note?.bodyText || note?.content || note?.desc),
      url: safeUrl(note?.url || note?.source),
      metrics: {
        likes: metric(note?.metrics?.likes ?? note?.stats?.likes ?? note?.liked_count),
        favorites: metric(note?.metrics?.favorites ?? note?.stats?.collects ?? note?.collected_count),
        comments: metric(note?.metrics?.comments ?? note?.stats?.comments ?? note?.comment_count),
      },
      capturedAt: text(note?.capturedAt) || syncedAt,
    })).filter((note) => note.noteId || note.title || note.bodyText),
  };
}

export function emptyAccountProfile() {
  return {
    version: 1,
    displayName: '',
    positioning: '',
    niche: '',
    targetAudience: '',
    contentPillars: [],
    accountPromise: [],
    valuePromise: [],
    strengths: [],
    weaknesses: [],
    contentBoundaries: [],
    privacyConstraints: [],
    currentContext: {
      recentlyDoing: '',
      currentProjects: [],
      currentTools: [],
      currentLearning: [],
      currentGoals: [],
    },
    updatedAt: null,
    fieldSources: {},
    fieldMetadata: {},
    facts: null,
    recentContent: { syncedAt: null, count: 0, notes: [] },
    profileAnalysis: null,
  };
}

export function createAccountProfile(input = {}, now = new Date().toISOString()) {
  const current = input.currentContext || {};
  const profile = {
    ...emptyAccountProfile(),
    displayName: text(input.displayName),
    positioning: text(input.positioning),
    niche: text(input.niche),
    targetAudience: text(input.targetAudience),
    contentPillars: sanitizeList(input.contentPillars),
    accountPromise: sanitizeList(input.accountPromise),
    valuePromise: sanitizeList(input.valuePromise || input.accountPromise),
    strengths: sanitizeList(input.strengths),
    weaknesses: sanitizeList(input.weaknesses),
    contentBoundaries: sanitizeList(input.contentBoundaries),
    privacyConstraints: sanitizeList(input.privacyConstraints),
    currentContext: {
      recentlyDoing: text(current.recentlyDoing),
      currentProjects: sanitizeList(current.currentProjects),
      currentTools: sanitizeList(current.currentTools),
      currentLearning: sanitizeList(current.currentLearning),
      currentGoals: sanitizeList(current.currentGoals),
    },
    updatedAt: now,
    facts: input.facts ? normalizeXhsAccountFacts(input.facts, now) : null,
    recentContent: input.recentContent && typeof input.recentContent === 'object'
      ? normalizeRecentContent(input.recentContent.notes, input.recentContent.syncedAt || now)
      : { syncedAt: null, count: 0, notes: [] },
    profileAnalysis: input.profileAnalysis && typeof input.profileAnalysis === 'object' ? { ...input.profileAnalysis } : null,
  };
  const confirmedFields = [
    'displayName', 'positioning', 'niche', 'targetAudience', 'contentPillars', 'accountPromise', 'valuePromise',
    'strengths', 'weaknesses', 'contentBoundaries', 'privacyConstraints',
    'currentContext.recentlyDoing', 'currentContext.currentProjects', 'currentContext.currentTools',
    'currentContext.currentLearning', 'currentContext.currentGoals',
  ];
  profile.fieldSources = input.fieldSources && typeof input.fieldSources === 'object'
    ? { ...input.fieldSources }
    : Object.fromEntries(confirmedFields.map((field) => [field, 'user_confirmed']));
  profile.fieldMetadata = input.fieldMetadata && typeof input.fieldMetadata === 'object' ? { ...input.fieldMetadata } : {};
  return profile;
}
