import { useEffect, useState } from 'react';
import { actOnOpportunity, getOpportunities } from '../api';
import { PageHeader } from '../components/PageHeader';
import { StatusTag } from '../components/StatusTag';
import './opportunities.css';

const filters = [['all', '全部'], ['QUALIFIED', '可行动'], ['WATCH', '观察'], ['HOLD', '暂缓'], ['saved', '已保存'], ['dismissed', '已忽略']];
const tone = (status) => status === 'QUALIFIED' ? 'green' : status === 'WATCH' ? 'blue' : status === 'HOLD' ? 'orange' : 'neutral';
const labels = { QUALIFIED: '可行动', WATCH: '继续观察', HOLD: '暂缓', INSUFFICIENT_EVIDENCE: '证据不足' };

export function OpportunityPage({ onNavigate }) {
  const [items, setItems] = useState([]); const [filter, setFilter] = useState('all'); const [state, setState] = useState('loading'); const [busy, setBusy] = useState('');
  const load = () => { setState('loading'); return getOpportunities().then((data) => { setItems(data.opportunities || []); setState('ready'); }).catch(() => setState('error')); };
  useEffect(() => { load(); }, []);
  const visible = items.filter((item) => filter === 'all' || item.decisionStatus === filter || item.userState === filter);
  async function act(item, action) {
    setBusy(`${item.id}:${action}`);
    try { const updated = await actOnOpportunity(item.id, action); setItems((current) => current.map((value) => value.id === updated.id ? updated : value)); if (action === 'select') onNavigate('writing'); }
    finally { setBusy(''); }
  }
  return <>
    <PageHeader title="今日机会" description="基于平台信号、账号匹配与当前状态生成。平台证据与账号适配分开计算。" actions={<button className="button button--secondary" onClick={load}>重新计算</button>} />
    <div className="hot-filter-tabs opportunity-filters">{filters.map(([key, label]) => <button key={key} className={filter === key ? 'hot-filter-tab hot-filter-tab--active' : 'hot-filter-tab'} onClick={() => setFilter(key)}>{label}</button>)}</div>
    {state === 'loading' && <div className="async-state async-state--loading"><div><strong>正在同步计算机会</strong><p>没有 Agent Job，也不会修改平台证据。</p></div></div>}
    {state === 'error' && <div className="hot-empty-state"><strong>机会读取失败</strong><button className="button button--secondary" onClick={load}>重试</button></div>}
    {state === 'ready' && !visible.length && <div className="hot-empty-state"><strong>当前筛选下暂无机会</strong><p>真实 Discovery 没有 Cluster 时不会生成演示机会。</p></div>}
    {state === 'ready' && <div className="opportunity-grid">{visible.map((item) => <OpportunityCard key={item.id} item={item} busy={busy} onAction={act} onEvidence={() => onNavigate('discover')} />)}</div>}
  </>;
}

function ListBlock({ title, values, kind = '' }) { return values?.length ? <div className={`opportunity-list ${kind}`}><strong>{title}</strong><ul>{values.map((value) => <li key={value}>{value}</li>)}</ul></div> : null; }
function OpportunityCard({ item, busy, onAction, onEvidence }) {
  const disabled = Boolean(busy); const selected = item.userState === 'selected';
  return <article className={selected ? 'opportunity-card opportunity-card--selected' : 'opportunity-card'}>
    <header><div className="opportunity-tags"><StatusTag tone={tone(item.decisionStatus)}>{labels[item.decisionStatus] || item.decisionStatus}</StatusTag><StatusTag tone="neutral">{item.userState}</StatusTag>{item.manualOverride && <StatusTag tone="orange">人工越过建议</StatusTag>}</div><h2>{item.title}</h2></header>
    <div className="opportunity-columns"><ListBlock title="为什么现在值得看" values={item.whyNow} /><ListBlock title="为什么和账号相关" values={item.whyFit} /></div>
    <dl className="opportunity-metrics"><div><dt>独立作者</dt><dd>{item.platform.independentAuthors}</dd></div><div><dt>当前 / 参考</dt><dd>{item.platform.currentSamples} / {item.platform.referenceSamples}</dd></div><div><dt>Outlier</dt><dd>{item.platform.outlierCount}</dd></div><div><dt>平台置信度</dt><dd>{item.platform.confidence}</dd></div><div><dt>Account fit</dt><dd>{item.accountFit.status}</dd></div><div><dt>Current relevance</dt><dd>{item.currentRelevance.status}</dd></div><div><dt>Matching</dt><dd>{item.matchingConfidence}</dd></div></dl>
    <ListBlock title="具体阻断因素" values={item.blockingFactors} kind="opportunity-warning" /><ListBlock title="缺失证据" values={item.missingEvidence} kind="opportunity-warning" /><ListBlock title="内容限制" values={item.privacyConstraints} kind="opportunity-limit" />
    <details className="opportunity-evidence"><summary>查看平台证据（{item.evidenceSignalIds.length}）</summary>{item.evidenceSignals.length ? <ul>{item.evidenceSignals.map((signal) => <li key={signal.id}>{signal.title}<small>{signal.id}</small></li>)}</ul> : <p>{item.evidenceSignalIds.join('、')}</p>}<button className="card-action" onClick={onEvidence}>前往发现页</button></details>
    <p className="opportunity-next"><strong>下一步：</strong>{item.nextStep}</p>
    <div className="opportunity-actions">
      {item.userState === 'dismissed' ? <button className="button button--secondary" disabled={disabled} onClick={() => onAction(item, 'reopen')}>重新打开</button> : <><button className="button button--secondary" disabled={disabled} onClick={() => onAction(item, 'save')}>{item.userState === 'saved' ? '已保存' : item.decisionStatus === 'WATCH' ? '保存观察' : '保存'}</button><button className="button button--primary" disabled={disabled} onClick={() => onAction(item, 'select')}>{item.decisionStatus === 'QUALIFIED' ? '选择并进入创作' : '仍然选择（保留限制）'}</button><button className="topic-dismiss" disabled={disabled} onClick={() => onAction(item, 'dismiss')}>忽略</button></>}
    </div>
  </article>;
}
