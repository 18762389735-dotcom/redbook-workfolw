import { assessOutlier } from './outlier.mjs';
import { buildKeywordClusters, buildTitleOverlapClusters } from './clustering.mjs';
import { isDiscoveryEligibleSignal } from '../signals/provenance.mjs';

export function buildDiscovery({ signals = [], creators = [], now = new Date() } = {}) {
  const discoverySignals = signals.filter(isDiscoveryEligibleSignal);
  const outliers = discoverySignals.map((signal) => assessOutlier(signal, signals, creators, now));
  const clusters = [
    ...buildKeywordClusters(discoverySignals, outliers, now),
    ...buildTitleOverlapClusters(discoverySignals, outliers, now),
  ];
  return {
    generatedAt: new Date(now).toISOString(),
    outliers,
    clusters,
    limitations: [
      'Discovery 只使用公开平台 Signal、Creator Snapshot 与 Creator Baseline。',
      '未评估账号适配、个人偏好、个人材料、知识库或可写性。',
      '标题共现与搜索语境只能作为 provisional 平台线索。',
    ],
  };
}
