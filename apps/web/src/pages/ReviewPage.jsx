import { useEffect, useState } from 'react';
import { getReview, updatePublishRecord } from '../api';
import { PageHeader } from '../components/PageHeader';
import { StatusTag } from '../components/StatusTag';
import './review.css';

const keys = ['views', 'likes', 'favorites', 'comments'];
const labels = { views: '浏览', likes: '点赞', favorites: '收藏', comments: '评论' };
const date = (value) => value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '暂无';

export function ReviewPage() {
  const [records, setRecords] = useState([]);
  const [state, setState] = useState('loading');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const load = () => { setState('loading'); return getReview().then((result) => { setRecords(result.records || []); setState('ready'); }).catch((reason) => { setError(reason.message || '复盘数据读取失败'); setState('error'); }); };
  useEffect(() => { load(); }, []);
  const saveMetrics = async (record, windowKey, values) => {
    setBusy(`${record.id}:${windowKey}`); setError('');
    try { const result = await updatePublishRecord(record.id, { [windowKey]: values }); setRecords((current) => current.map((item) => item.id === result.record.id ? result.record : item)); }
    catch (reason) { setError(reason.message || '指标保存失败'); }
    finally { setBusy(''); }
  };
  return <>
    <PageHeader title="复盘" description="查看已发布内容，人工补充 24h / 72h 数据。" actions={<button className="button button--secondary" onClick={load}>重新读取</button>} />
    {error && <div className="page-message page-message--error">{error}</div>}
    {state === 'loading' && <div className="async-state async-state--loading"><div><strong>正在读取发布记录</strong></div></div>}
    {state === 'error' && <section className="hot-empty-state"><strong>复盘数据读取失败</strong><button className="button button--secondary" onClick={load}>重试</button></section>}
    {state === 'ready' && !records.length && <section className="hot-empty-state"><strong>还没有发布记录</strong><p>在创作页保存草稿后，使用“标记已发布”记录第一条内容。</p></section>}
    {state === 'ready' && records.length ? <div className="review-list">{records.map((record) => <ReviewCard key={record.id} record={record} busy={busy} onSave={saveMetrics} />)}</div> : null}
  </>;
}

function ReviewCard({ record, busy, onSave }) {
  return <article className="review-card"><header><div><StatusTag tone="green">已发布</StatusTag><h2>{record.draftTitle || record.opportunityTitle || '未命名内容'}</h2><p>机会判断：{record.decisionStatus || '暂无'} · 发布时间：{date(record.publishedAt)}</p></div><a href={record.publishedUrl} target="_blank" rel="noreferrer">打开发布链接</a></header><MetricEditor title="24h 数据" windowKey="metrics24h" values={record.metrics24h} busy={busy === `${record.id}:metrics24h`} onSave={(values) => onSave(record, 'metrics24h', values)} /><MetricEditor title="72h 数据" windowKey="metrics72h" values={record.metrics72h} busy={busy === `${record.id}:metrics72h`} onSave={(values) => onSave(record, 'metrics72h', values)} />{record.notes && <p className="review-notes">备注：{record.notes}</p>}</article>;
}

function MetricEditor({ title, values = {}, busy, onSave }) {
  const [draft, setDraft] = useState(values);
  useEffect(() => { setDraft(values); }, [values]);
  return <form className="review-metrics" onSubmit={(event) => { event.preventDefault(); onSave(draft); }}><strong>{title}</strong>{keys.map((key) => <label key={key}>{labels[key]}<input type="number" min="0" value={draft[key] ?? ''} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} /></label>)}<button className="button button--secondary" disabled={busy}>{busy ? '保存中' : '保存数据'}</button></form>;
}
