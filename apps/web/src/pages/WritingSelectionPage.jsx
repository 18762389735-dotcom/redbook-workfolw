import { useEffect, useState } from 'react';
import { createPublishRecord, createWritingDraft, getWritingWorkspace, updateWritingDraft } from '../api';
import { PageHeader } from '../components/PageHeader';
import { StatusTag } from '../components/StatusTag';
import './writing-mvp.css';

const list = (value) => Array.isArray(value) ? value : [];
const display = (value, fallback = '暂无') => value === null || value === undefined || String(value).trim() === '' ? fallback : String(value);

export function WritingSelectionPage({ onNavigate }) {
  const [opportunity, setOpportunity] = useState(null);
  const [draft, setDraft] = useState(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [state, setState] = useState('loading');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setState('loading');
    setError('');
    try {
      const result = await getWritingWorkspace();
      const selected = result.selectedOpportunity || null;
      const existing = selected ? list(result.drafts).find((item) => item.opportunityId === selected.id) || null : null;
      setOpportunity(selected);
      setDraft(existing);
      setTitle(existing?.title || '');
      setBody(existing?.body || '');
      setState('ready');
    } catch (loadError) {
      setError(loadError.message || '创作数据读取失败');
      setState('error');
    }
  };

  useEffect(() => { load(); }, []);

  const generate = async () => {
    if (!opportunity) return;
    setBusy('generate');
    setError('');
    setNotice('');
    try {
      const result = await createWritingDraft(opportunity.id);
      const next = result.draft;
      setDraft(next);
      setTitle(next.title || '');
      setBody(next.body || '');
      setNotice(result.created === false ? '已恢复这份草稿。' : '已根据 Opportunity 生成创作简报和初稿。');
    } catch (generateError) {
      setError(generateError.message || '草稿生成失败');
    } finally {
      setBusy('');
    }
  };

  const save = async () => {
    if (!draft) return;
    setBusy('save');
    setError('');
    setNotice('');
    try {
      const result = await updateWritingDraft(draft.id, { title, body });
      setDraft(result.draft);
      setTitle(result.draft.title || '');
      setBody(result.draft.body || '');
      setNotice('草稿已保存。');
    } catch (saveError) {
      setError(saveError.message || '草稿保存失败');
    } finally {
      setBusy('');
    }
  };

  const publish = async ({ publishedUrl, publishedAt, notes }) => {
    if (!draft || !opportunity) return;
    setBusy('publish');
    setError('');
    setNotice('');
    try {
      await createPublishRecord({
        draftId: draft.id,
        opportunityId: opportunity.id,
        publishedUrl,
        publishedAt,
        notes,
        draftTitle: title,
        opportunityTitle: opportunity.title,
        decisionStatus: opportunity.decisionStatus,
      });
      setNotice('已记录发布，可在“复盘”中补充 24h / 72h 数据。');
    } catch (publishError) {
      setError(publishError.message || '发布记录保存失败');
      throw publishError;
    } finally {
      setBusy('');
    }
  };

  if (state === 'loading') return <><PageHeader title="创作" description="把已选择的真实机会整理成可编辑草稿。" /><div className="async-state async-state--loading"><div><strong>正在读取创作准备</strong></div></div></>;
  if (state === 'error') return <><PageHeader title="创作" description="把已选择的真实机会整理成可编辑草稿。" /><section className="hot-empty-state"><strong>{error}</strong><button className="button button--secondary" onClick={load}>重试</button></section></>;
  if (!opportunity) return <><PageHeader title="创作" description="先从机会页选择一个真实机会，再生成创作简报。" /><section className="page-placeholder"><div><strong>尚未选择机会</strong><p>机会页的“选择并进入创作”会保留平台证据和账号适配信息。</p><button className="button button--secondary" onClick={() => onNavigate('opportunities')}>返回机会页</button></div></section></>;

  const brief = draft?.brief || buildPreviewBrief(opportunity);
  return <>
    <PageHeader title="创作" description="先确认依据，再生成一份可以继续编辑的初稿。" actions={<button className="button button--secondary" onClick={load}>重新读取</button>} />
    {(notice || error) && <div className={error ? 'page-message page-message--error' : 'page-message'}>{error || notice}</div>}
    {!draft ? <BriefCard brief={brief} opportunity={opportunity} busy={busy} onGenerate={generate} onBack={() => onNavigate('opportunities')} /> : <DraftEditor brief={brief} title={title} body={body} busy={busy} onTitle={setTitle} onBody={setBody} onSave={save} onPublish={publish} onBack={() => onNavigate('opportunities')} />}
  </>;
}

function buildPreviewBrief(opportunity) {
  return {
    topic: opportunity.title,
    whyWorthDoing: [...list(opportunity.whyNow), ...list(opportunity.whyFit)],
    evidence: list(opportunity.evidenceSignals).map((signal) => ({ id: signal.id, title: signal.title, bodyText: '', author: {}, metrics: {}, url: null })),
    targetAudience: '将在生成时读取当前账号资料',
    accountFit: { status: opportunity.accountFit?.status || 'unknown', positioning: '将在生成时读取当前账号资料', reasons: list(opportunity.whyFit) },
    confidence: opportunity.confidence || opportunity.matchingConfidence || 'unknown',
    evidenceCompleteness: opportunity.evidenceCompleteness || null,
    missingEvidence: list(opportunity.missingEvidence),
    titleCandidates: [],
    structure: [],
    constraints: [...list(opportunity.blockingFactors), ...list(opportunity.missingEvidence), ...list(opportunity.privacyConstraints)],
  };
}

function BriefCard({ brief, opportunity, busy, onGenerate, onBack }) {
  return <section className="writing-brief-card">
    <div className="writing-mvp-heading"><div><StatusTag tone="red">Opportunity → Brief</StatusTag><h2>{display(brief.topic, opportunity.title)}</h2><p>先看为什么值得做、引用哪些真实 Signal，以及账号适配边界。</p></div><StatusTag tone={opportunity.decisionStatus === 'QUALIFIED' ? 'green' : 'orange'}>{display(opportunity.decisionStatus, '待确认')}</StatusTag></div>
    <BriefContent brief={brief} />
    <div className="writing-mvp-actions"><button className="button button--secondary" onClick={onBack}>返回机会页</button><button className="button button--primary" onClick={onGenerate} disabled={busy !== ''}>{busy === 'generate' ? '正在生成初稿' : '生成可编辑初稿'}</button></div>
  </section>;
}

function BriefContent({ brief }) {
  return <div className="writing-brief-grid">
    <BriefList title="为什么值得做" values={brief.whyWorthDoing} />
    <div className="writing-brief-block"><strong>目标受众 / 账号适配</strong><p>目标受众：{display(brief.targetAudience)}</p><p>账号定位：{display(brief.accountFit?.positioning)}</p><p>适配状态：{display(brief.accountFit?.status)}</p><p>证据完整度：{display(brief.evidenceCompleteness || brief.confidence, '未知')}</p>{list(brief.accountFit?.reasons).map((value, index) => <small key={index}>{value}</small>)}</div>
    <div className="writing-brief-block writing-brief-block--wide"><strong>引用的真实 Signal（{list(brief.evidence).length}）</strong>{list(brief.evidence).length ? <div className="writing-evidence-list">{brief.evidence.map((signal) => <Evidence key={signal.id} signal={signal} />)}</div> : <p>当前 Opportunity 没有可引用的 Signal。</p>}</div>
    <BriefList title="限制与待确认" values={brief.constraints} wide />
  </div>;
}

function BriefList({ title, values, wide = false }) { return <div className={wide ? 'writing-brief-block writing-brief-block--wide' : 'writing-brief-block'}><strong>{title}</strong>{list(values).length ? <ul>{values.map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}</ul> : <p>暂无明确记录。</p>}</div>; }

function Evidence({ signal }) {
  const metrics = [['likes', '赞'], ['favorites', '收藏'], ['comments', '评论'], ['shares', '分享']].filter(([key]) => Number.isFinite(signal.metrics?.[key])).map(([, label]) => `${label} ${signal.metrics[key]}`).join('，');
  return <article className="writing-evidence"><strong>《{display(signal.title, '未命名笔记')}》</strong><span>{display(signal.author?.name, '作者资料暂无')}{metrics ? ` · ${metrics}` : ''}</span>{signal.bodyText ? <p>{String(signal.bodyText).slice(0, 180)}{String(signal.bodyText).length > 180 ? '…' : ''}</p> : null}{signal.url ? <a href={signal.url} target="_blank" rel="noreferrer">查看原始 Signal</a> : null}</article>;
}

function DraftEditor({ brief, title, body, busy, onTitle, onBody, onSave, onBack }) {
  const candidates = list(brief.titleCandidates);
  const [showPublish, setShowPublish] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState('');
  const [publishedAt, setPublishedAt] = useState('');
  const [publishNotes, setPublishNotes] = useState('');
  const [publishError, setPublishError] = useState('');
  const submitPublish = async (event) => {
    event.preventDefault();
    setPublishError('');
    try {
      await onPublish({ publishedUrl, publishedAt: new Date(publishedAt).toISOString(), notes: publishNotes });
      setShowPublish(false);
    } catch (error) { setPublishError(error.message || '发布记录保存失败'); }
  };
  return <section className="writing-draft-card">
    <div className="writing-mvp-heading"><div><StatusTag tone="green">Brief → Draft</StatusTag><h2>{display(brief.topic, '当前选题')}</h2><p>以下内容来自现有 Opportunity 与真实 Signal，可直接修改。</p></div><StatusTag tone="neutral">本地草稿</StatusTag></div>
    <BriefContent brief={brief} />
    <div className="writing-title-candidates"><strong>标题候选（{candidates.length}）</strong><div>{candidates.map((candidate, index) => <button key={`${candidate}-${index}`} className={title === candidate ? 'writing-title-chip writing-title-chip--active' : 'writing-title-chip'} onClick={() => onTitle(candidate)}>{index + 1}. {candidate}</button>)}</div></div>
    <label className="writing-mvp-field">标题<input value={title} onChange={(event) => onTitle(event.target.value)} maxLength={80} /></label>
    <label className="writing-mvp-field">正文草稿<textarea value={body} onChange={(event) => onBody(event.target.value)} /></label>
    <div className="writing-structure-preview"><strong>内容结构</strong><ol>{list(brief.structure).map((step, index) => <li key={`${step}-${index}`}>{step}</li>)}</ol></div>
    <div className="writing-mvp-actions"><button className="button button--secondary" onClick={onBack}>返回机会页</button><button className="button button--secondary" onClick={() => setShowPublish(true)} disabled={busy !== ''}>标记已发布</button><button className="button button--primary" onClick={onSave} disabled={busy !== '' || !title.trim() || !body.trim()}>{busy === 'save' ? '正在保存' : '保存草稿'}</button></div>
    {showPublish && <form className="publish-record-form" onSubmit={submitPublish}><strong>记录这份稿件已发布</strong><label className="writing-mvp-field">已发布链接<input type="url" required value={publishedUrl} onChange={(event) => setPublishedUrl(event.target.value)} placeholder="https://www.xiaohongshu.com/..." /></label><label className="writing-mvp-field">发布时间<input type="datetime-local" required value={publishedAt} onChange={(event) => setPublishedAt(event.target.value)} /></label><label className="writing-mvp-field">备注<textarea value={publishNotes} onChange={(event) => setPublishNotes(event.target.value)} /></label>{publishError && <p className="page-message page-message--error">{publishError}</p>}<div className="writing-mvp-actions"><button type="button" className="button button--secondary" onClick={() => setShowPublish(false)}>取消</button><button type="submit" className="button button--primary" disabled={busy !== ''}>{busy === 'publish' ? '正在保存' : '保存发布记录'}</button></div></form>}
  </section>;
}
