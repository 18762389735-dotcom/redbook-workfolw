const text = (value) => typeof value === 'string' ? value.trim() : '';

export function sanitizeList(value) {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/\r?\n/) : [];
  return [...new Set(values.map(text).filter(Boolean))];
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
  };
  const confirmedFields = [
    'displayName', 'positioning', 'niche', 'targetAudience', 'contentPillars', 'accountPromise',
    'strengths', 'weaknesses', 'contentBoundaries', 'privacyConstraints',
    'currentContext.recentlyDoing', 'currentContext.currentProjects', 'currentContext.currentTools',
    'currentContext.currentLearning', 'currentContext.currentGoals',
  ];
  profile.fieldSources = Object.fromEntries(confirmedFields.map((field) => [field, 'user_confirmed']));
  return profile;
}
