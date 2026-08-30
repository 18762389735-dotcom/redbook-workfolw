import { useEffect, useMemo, useState } from 'react';
import { getDiscovery, listCreators, listSignals } from '../api';
import { PageHeader } from '../components/PageHeader';
import { StatusTag } from '../components/StatusTag';

const empty = '暂无';
const value = (item) => item === null || item === undefined || item === '' ? empty : item;
const date = (item) => item ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item)) : empty;
const metric = (item) => item === null || item === undefined ? empty : new Intl.NumberFormat('zh-CN').format(item);
const tone = (status) => status === 'observed' ? 'red' : status === 'not_observed' ? 'green' : status === 'insufficient' ? 'orange' : 'neutral';
const observations = (signal) => signal.observations?.length ? signal.observations : [{ ...signal.source, capturedAt: signal.capturedAt }];
const role = (signal) => {
  const methods = new Set(observations(signal).map((item) => item.method));
  const discovered = methods.has('visible-notes') || methods.has('current-note');
  const baseline = methods.has('creator-baseline');
  return discovered && baseline ? '发现 + 基线' : baseline ? '基线' : discovered ? '发现' : '其他';
};

function SignalTable({ signals, creatorsByUser, assessmentsBySignal }) {
  return <div className="signal-table-wrap"><table className="signal-table"><thead><tr><th>笔记</th><th>作者 / 粉丝</th><th>互动</th><th>发布时间</th><th>来源</th><th>采集时间</th></tr></thead><tbody>{signals.map((signal) => {
    const creator = creatorsByUser.get(signal.author.id);
    const assessment = assessmentsBySignal.get(signal.id);
    return <tr key={signal.id}><td><strong>{value(signal.title)}</strong><small>{signal.url ? <a href={signal.url} target="_blank" rel="noreferrer">打开原链接</a> : empty}</small></td><td>{value(signal.author.name)}<small>{metric(creator?.metrics?.followers ?? signal.author.followerCount)} 粉丝</small>{!creator && <em className="evidence-gap">缺博主资料</em>}{(!assessment || assessment.baseline.sampleCount < 3) && <em className="evidence-gap">缺作者近期基线</em>}</td><td><span>赞 {metric(signal.metrics.likes)}</span><span>藏 {metric(signal.metrics.favorites)}</span><span>评 {metric(signal.metrics.comments)}</span><span>转 {metric(signal.metrics.shares)}</span></td><td>{date(signal.publishedAt)}</td><td><StatusTag tone="neutral">{role(signal)}</StatusTag><small>{value(signal.source.method)} · {observations(signal).length} 次观察</small>{observations(signal).filter((item) => item.keyword).map((item) => <small key={`${item.taskId}:${item.keyword}`}>关键词：{item.keyword}</small>)}</td><td>{date(signal.capturedAt)}</td></tr>;
  })}</tbody></table></div>;
}

function OutlierList({ outliers, signalsById }) {
  if (!outliers.length) return <div className="hot-empty-state"><strong>暂无可评估笔记</strong><p>先采集真实笔记，再补采作者资料与近期基线。</p></div>;
  return <div className="evidence-grid">{outliers.map((item) => {
    const signal = signalsById.get(item.signalId);
    return <article className="evidence-card" key={item.signalId}>
      <header><div><h3>{value(signal?.title)}</h3><p>{value(signal?.author?.name)} · 粉丝 {metric(item.followerCount)}</p></div><div className="evidence-tags"><StatusTag tone={tone(item.status)}>{item.status}</StatusTag><StatusTag tone="neutral">{item.confidence}</StatusTag></div></header>
      <dl className="evidence-metrics"><div><dt>当前点赞</dt><dd>{metric(item.targetLikes)}</dd></div><div><dt>近期中位数</dt><dd>{metric(item.baseline.medianLikes)}</dd></div><div><dt>有效样本</dt><dd>{item.baseline.sampleCount} 篇</dd></div><div><dt>异常倍数</dt><dd>{item.baseline.ratio === null ? empty : `${item.baseline.ratio}×`}</dd></div></dl>
      <p className="evidence-reason">{item.reasons.join(' ')}</p>
      {!!item.missingEvidence.length && <p className="evidence-missing">缺失证据：{item.missingEvidence.join('、')}</p>}
    </article>;
  })}</div>;
}

function ClusterList({ clusters }) {
  if (!clusters.length) return <div className="hot-empty-state"><strong>暂无信号簇</strong><p>关键词搜索语境可直接形成 provisional cluster；标题共现至少需要 3 位独立作者。</p></div>;
  return <div className="evidence-grid">{clusters.map((cluster) => <article className="evidence-card" key={cluster.signal_cluster_id}>
    <header><div><h3>{cluster.cluster_name}</h3><p>{cluster.cluster_status} · 仅为平台证据</p></div><div className="evidence-tags"><StatusTag tone="blue">{cluster.platform_signal_strength}</StatusTag><StatusTag tone="neutral">{cluster.platform_confidence}</StatusTag></div></header>
    <dl className="evidence-metrics"><div><dt>当前样本</dt><dd>{cluster.supporting_current_sample_ids.length}</dd></div><div><dt>参考样本</dt><dd>{cluster.supporting_reference_sample_ids.length}</dd></div><div><dt>独立作者</dt><dd>{cluster.independent_author_count}</dd></div><div><dt>异常样本</dt><dd>{cluster.observed_outlier_ids.length}</dd></div></dl>
    {!!cluster.missing_evidence.length && <p className="evidence-missing">缺失证据：{cluster.missing_evidence.join('、')}</p>}
    {cluster.limitations.map((item) => <p className="evidence-reason" key={item}>{item}</p>)}
    <small>下一步：{cluster.recommended_next_step}</small>
  </article>)}</div>;
}

export function DiscoverPage() {
  const [data, setData] = useState({ signals: [], creators: [], discovery: { outliers: [], clusters: [] }, latestTaskId: null });
  const [state, setState] = useState('loading');
  const [filter, setFilter] = useState('all');
  const load = async () => {
    setState('loading');
    try {
      const [signalResult, creatorResult, discovery] = await Promise.all([listSignals(), listCreators(), getDiscovery()]);
      setData({ signals: signalResult.signals, latestTaskId: signalResult.latestTaskId, creators: creatorResult.creators, discovery });
      setState('ready');
    } catch { setState('error'); }
  };
  useEffect(() => { load(); }, []);
  const creatorsByUser = useMemo(() => new Map(data.creators.map((item) => [item.userId, item])), [data.creators]);
  const signalsById = useMemo(() => new Map(data.signals.map((item) => [item.id, item])), [data.signals]);
  const assessmentsBySignal = useMemo(() => new Map(data.discovery.outliers.map((item) => [item.signalId, item])), [data.discovery.outliers]);
  const visibleSignals = filter === 'latest' ? data.signals.filter((signal) => data.latestTaskId && observations(signal).some((item) => item.taskId === data.latestTaskId)) : data.signals;
  const tabs = [['all', '全部笔记'], ['latest', '最新采集'], ['outliers', '异常候选'], ['clusters', '信号簇']];
  return <>
    <PageHeader title="发现" description="只展示平台证据；账号适配与个人适配均未评估。" actions={<button className="button button--primary" onClick={load}>刷新数据</button>} />
    <section className="collector-guide"><div><strong>Beav-derived Collector</strong><p>支持搜索页真实 keyword、当前博主资料与低频近期基线；不读取或保存 Cookie、密码。</p></div><code>vendor/beav/xhs-collector</code></section>
    <div className="hot-filter-tabs" aria-label="发现内容筛选">{tabs.map(([key, label]) => <button key={key} className={filter === key ? 'hot-filter-tab hot-filter-tab--active' : 'hot-filter-tab'} onClick={() => setFilter(key)}>{label}</button>)}</div>
    {state === 'loading' && <div className="hot-empty-state"><strong>正在读取平台证据</strong><p>无需等待 Agent，也不会读取个人上下文。</p></div>}
    {state === 'error' && <div className="hot-empty-state"><strong>无法读取本地数据</strong><p>请确认本地服务正在运行后重试。</p></div>}
    {state === 'ready' && ['all', 'latest'].includes(filter) && (visibleSignals.length ? <SignalTable signals={visibleSignals} creatorsByUser={creatorsByUser} assessmentsBySignal={assessmentsBySignal} /> : <div className="hot-empty-state"><strong>{filter === 'latest' ? '暂无最新采集批次' : '尚未采集到真实内容'}</strong><p>系统不会使用演示数据代替。</p></div>)}
    {state === 'ready' && filter === 'outliers' && <OutlierList outliers={data.discovery.outliers} signalsById={signalsById} />}
    {state === 'ready' && filter === 'clusters' && <ClusterList clusters={data.discovery.clusters} />}
  </>;
}
