import { normalizeXiaohongshuCreator } from '../../providers/xiaohongshu/normalize-creator.mjs';

export async function ingestCreators(store, payload) {
  if (!payload || !Array.isArray(payload.creators)) throw new TypeError('请求体必须包含 creators 数组');
  const normalized = payload.creators.map((raw) => normalizeXiaohongshuCreator(raw, raw?.source));
  return store.upsertMany(normalized);
}
