export const ACCOUNT_FIELDS = ['positioning', 'niche', 'targetAudience', 'contentPillars', 'accountPromise', 'strengths'];
export const CONTEXT_FIELDS = ['recentlyDoing', 'currentProjects', 'currentTools', 'currentLearning', 'currentGoals'];

export function profileReady(profile = {}) {
  return Boolean(profile.positioning || profile.niche || profile.targetAudience || profile.contentPillars?.length);
}

export function contextReady(profile = {}) {
  const context = profile.currentContext || {};
  return CONTEXT_FIELDS.some((field) => Array.isArray(context[field]) ? context[field].length : Boolean(context[field]));
}
