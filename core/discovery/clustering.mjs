import { classifyPublishedAt } from './time.mjs';
import { getObservedKeywords } from '../signals/provenance.mjs';

const excludedTokens = new Set(['小红', '笔记', '我们', '这个', '一个', '真的']);

function titleTokens(title = '') {
  const text = String(title).replace(/[^\u4e00-\u9fffA-Za-z0-9]/g, '');
  const values = [];
  for (let index = 0; index < text.length - 1; index += 1) values.push(text.slice(index, index + 2));
  return [...new Set(values)].filter((value) => value.length === 2 && !excludedTokens.has(value));
}

function uniqueByAuthor(signals) {
  return [...new Map(signals.filter((signal) => signal.author?.id || signal.author?.name).map((signal) => [signal.author?.id || signal.author?.name, signal])).values()];
}

function clusterEvidence(signals, outliers, now) {
  const buckets = { current: [], reference: [], unknown: [] };
  for (const signal of signals) buckets[classifyPublishedAt(signal.publishedAt, now).bucket].push(signal.id);
  const observedOutlierIds = outliers.filter((item) => item.status === 'observed' && signals.some((signal) => signal.id === item.signalId)).map((item) => item.signalId);
  return { buckets, observedOutlierIds };
}

function buildCluster({ id, name, kind, signals, outliers, now }) {
  const uniqueAuthors = uniqueByAuthor(signals);
  const { buckets, observedOutlierIds } = clusterEvidence(signals, outliers, now);
  const authorCount = uniqueAuthors.length;
  const moderate = authorCount >= 4 && buckets.current.length >= 2;
  const missingEvidence = [];
  if (!buckets.current.length) missingEvidence.push('current_samples');
  if (buckets.unknown.length) missingEvidence.push('published_at_for_unknown_samples');
  if (!observedOutlierIds.length) missingEvidence.push('observed_outlier');
  if (authorCount < 4) missingEvidence.push('four_independent_authors');
  return {
    signal_cluster_id: id,
    cluster_name: name,
    cluster_status: 'provisional',
    platform_signal_strength: moderate ? 'moderate' : 'weak',
    platform_confidence: moderate && buckets.unknown.length === 0 ? 'medium' : 'low',
    supporting_current_sample_ids: buckets.current,
    supporting_reference_sample_ids: buckets.reference,
    supporting_unknown_time_sample_ids: buckets.unknown,
    independent_author_count: authorCount,
    observed_outlier_ids: observedOutlierIds,
    missing_evidence: missingEvidence,
    limitations: kind === 'keyword'
      ? ['这是同一次真实搜索语境中的样本，不代表整个平台趋势。']
      : ['这是不同作者标题二字共现，只能作为 provisional 线索，不能证明语义主题或趋势。'],
    recommended_next_step: missingEvidence.length ? '继续补充当前时间窗内的独立作者样本与作者基线。' : '继续观察后续平台样本是否保持一致。',
    account_fit_status: 'not_evaluated',
    personal_fit_status: 'not_evaluated',
  };
}

export function buildKeywordClusters(signals, outliers, now) {
  const groups = new Map();
  for (const signal of signals) {
    for (const keyword of getObservedKeywords(signal)) {
      const group = groups.get(keyword) || [];
      group.push(signal);
      groups.set(keyword, group);
    }
  }
  return [...groups.entries()].map(([keyword, items]) => buildCluster({ id: `keyword:${encodeURIComponent(keyword)}`, name: `搜索语境：${keyword}`, kind: 'keyword', signals: items, outliers, now }));
}

export function buildTitleOverlapClusters(signals, outliers, now) {
  const groups = new Map();
  for (const signal of signals) for (const token of titleTokens(signal.title)) {
    const group = groups.get(token) || [];
    group.push(signal);
    groups.set(token, group);
  }
  const signatures = new Set();
  return [...groups.entries()]
    .map(([token, items]) => ({ token, items: uniqueByAuthor(items) }))
    .filter(({ items }) => items.length >= 3)
    .sort((left, right) => right.items.length - left.items.length || left.token.localeCompare(right.token, 'zh-CN'))
    .filter(({ items }) => {
      const signature = items.map((item) => item.id).sort().join('|');
      if (signatures.has(signature)) return false;
      signatures.add(signature);
      return true;
    })
    .map(({ token, items }) => buildCluster({ id: `title-overlap:${encodeURIComponent(token)}`, name: `标题共现：${token}`, kind: 'title', signals: items, outliers, now }));
}
