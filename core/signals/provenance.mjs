const DISCOVERY_METHODS = new Set(['visible-notes', 'current-note']);
const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;

export function createObservation(value = {}, fallbackCapturedAt = null) {
  return {
    provider: text(value.provider),
    method: text(value.method),
    keyword: text(value.keyword),
    taskId: text(value.taskId),
    capturedAt: text(value.capturedAt) || text(fallbackCapturedAt),
  };
}

export function observationKey(observation) {
  return [observation.provider, observation.method, observation.taskId, observation.keyword].map((value) => value || '').join('\u001f');
}

export function mergeObservations(...collections) {
  const merged = new Map();
  for (const collection of collections) for (const raw of collection || []) {
    const observation = createObservation(raw);
    if (!observation.provider || !observation.method) continue;
    const key = observationKey(observation);
    const previous = merged.get(key);
    if (!previous || Date.parse(observation.capturedAt) > Date.parse(previous.capturedAt)) merged.set(key, observation);
  }
  return [...merged.values()].sort((left, right) => (Date.parse(left.capturedAt) || 0) - (Date.parse(right.capturedAt) || 0));
}

export function getObservations(signal) {
  if (Array.isArray(signal?.observations) && signal.observations.length) return mergeObservations(signal.observations);
  if (!signal?.source) return [];
  return mergeObservations([createObservation(signal.source, signal.capturedAt)]);
}

export function hasObservationMethod(signal, method) {
  return getObservations(signal).some((observation) => observation.method === method);
}

export function getObservationsByMethod(signal, method) {
  return getObservations(signal).filter((observation) => observation.method === method);
}

export function getDiscoveryObservations(signal) {
  return getObservations(signal).filter((observation) => DISCOVERY_METHODS.has(observation.method));
}

export function getBaselineObservations(signal) {
  return getObservationsByMethod(signal, 'creator-baseline');
}

export function getLatestObservation(signalOrObservations) {
  const observations = Array.isArray(signalOrObservations) ? mergeObservations(signalOrObservations) : getObservations(signalOrObservations);
  return observations.reduce((latest, observation) => !latest || (Date.parse(observation.capturedAt) || 0) >= (Date.parse(latest.capturedAt) || 0) ? observation : latest, null);
}

export function getObservedKeywords(signal) {
  return [...new Set(getDiscoveryObservations(signal).map((observation) => observation.keyword).filter(Boolean))];
}

export function isDiscoveryEligibleSignal(signal) {
  return getDiscoveryObservations(signal).length > 0;
}

export function observationToSource(observation) {
  if (!observation) return null;
  const { capturedAt, ...source } = observation;
  return source;
}
