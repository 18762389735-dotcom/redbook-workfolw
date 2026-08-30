import { normalizeXiaohongshuSignal } from '../../providers/xiaohongshu/normalize.mjs';

export async function ingestSignals(store, payload) {
  if (!payload || !Array.isArray(payload.signals)) throw new TypeError('请求体必须包含 signals 数组');
  const normalized = payload.signals.map((raw) => normalizeXiaohongshuSignal(raw, raw?.source));
  return store.upsertMany(normalized);
}
