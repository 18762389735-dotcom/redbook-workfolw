import { useEffect, useState } from 'react';
import { analyzeAccountProfile, getAccount, updateAccount } from '../api';
import { PageHeader } from '../components/PageHeader';
import './account.css';

const fields = [
  ['displayName', '账号名称', '例如：我的设计实践'],
  ['positioning', '账号定位', '你希望持续提供什么内容'],
  ['niche', '领域 / Niche', '例如：设计实践、AI 工具'],
  ['targetAudience', '目标受众', '你希望帮助谁'],
];
const arrays = [
  ['contentPillars', '内容支柱'], ['accountPromise', '账号价值承诺'], ['strengths', '优势'], ['weaknesses', '潜在问题'],
  ['contentBoundaries', '内容边界'], ['privacyConstraints', '隐私约束'],
];
const empty = {
  displayName: '', positioning: '', niche: '', targetAudience: '', contentPillars: [], accountPromise: [], strengths: [], weaknesses: [], contentBoundaries: [], privacyConstraints: [],
  currentContext: { recentlyDoing: '', currentProjects: [], currentTools: [], currentLearning: [], currentGoals: [] }, facts: null, recentContent: { count: 0, notes: [] }, profileAnalysis: null,
};
const lines = (value) => Array.isArray(value) ? value.join('\n') : '';
const displayMetric = (value) => value === null || value === undefined ? '暂无' : Number(value).toLocaleString('zh-CN');

function Fact({ label, value }) {
  return <div className="account-fact"><span>{label}</span><strong>{value || '暂无'}</strong></div>;
}

export function AccountPage({ onSaved }) {
  const [profile, setProfile] = useState(empty);
  const [state, setState] = useState('loading');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const desktop = typeof window !== 'undefined' ? window.redbookDesktop : null;

  async function load() {
    setState('loading');
    try { const value = await getAccount(); setProfile({ ...empty, ...value }); setState('ready'); }
    catch { setState('error'); setMessage('账号资料加载失败，请稍后重试。'); }
  }
  useEffect(() => { void load(); }, []);

  const setField = (field, value) => setProfile((current) => ({ ...current, [field]: value }));

  async function syncFromXhs() {
    setState('syncing'); setMessage('');
    try {
      if (!desktop?.syncAccountProfile) {
        setState('ready');
        setMessage('请在小红书采集助手中打开自己的主页，点击“同步为我的账号”；完成后刷新此页面。');
        return;
      }
      const result = await desktop.syncAccountProfile();
      if (result?.account) setProfile(result.account);
      else await load();
      setState('ready'); setMessage('小红书主页事实已同步，并根据已保存笔记生成了账号画像。');
      onSaved?.(result?.account || profile);
    } catch (error) { setState('error'); setMessage(error instanceof Error ? error.message : '同步失败，请确认小红书会话已打开自己的主页。'); }
  }

  async function reanalyze() {
    setState('analyzing'); setMessage('');
    try { const result = await analyzeAccountProfile(); setProfile(result.profile || result); setState('ready'); setMessage('已根据当前保存的本人笔记重新分析，已确认字段未被覆盖。'); onSaved?.(result.profile || result); }
    catch { setState('error'); setMessage('画像分析失败，请先同步小红书主页并保存一些本人笔记。'); }
  }

  async function save(event) {
    event.preventDefault(); setState('saving'); setMessage('');
    try { const saved = await updateAccount(profile); setProfile(saved); setState('ready'); setEditing(false); setMessage('账号画像已确认并保存，Matching 将优先使用这些确认字段。'); onSaved?.(saved); }
    catch { setState('error'); setMessage('账号资料未保存，请稍后重试。'); }
  }

  const facts = profile.facts;
  const analysis = profile.profileAnalysis;
  return <>
    <PageHeader title="我的账号" description="从真实小红书公开主页和已保存的本人笔记生成画像；你可以确认或修改 AI 推断。" />
    {message && <div className={state === 'error' ? 'page-message page-message--error' : 'page-message'}>{message}</div>}
    {state === 'loading' ? <div className="async-state async-state--loading"><div><strong>正在加载账号资料</strong></div></div> : <div className="account-workspace">
      {!facts && <section className="account-form-section account-empty-state"><h2>从你的小红书主页生成账号画像</h2><p>打开自己的公开主页后同步，系统只读取公开资料和已保存的本人笔记，不读取 Cookie、密码或登录凭证。</p><button className="button button--primary" type="button" onClick={() => void syncFromXhs()} disabled={state === 'syncing'}>{state === 'syncing' ? '正在同步…' : '同步我的账号'}</button></section>}
      <section className="account-form-section"><div className="account-form-heading"><div><h2>账号事实</h2><p>来源：真实小红书公开主页 · {facts?.syncedAt ? `同步于 ${new Date(facts.syncedAt).toLocaleString('zh-CN')}` : '尚未同步'}</p></div><button className="button button--secondary" type="button" onClick={() => void syncFromXhs()} disabled={state === 'syncing'}>{state === 'syncing' ? '同步中…' : '同步小红书主页'}</button></div>{facts ? <div className="account-facts-grid"><Fact label="账号名" value={facts.accountName} /><Fact label="小红书号" value={facts.xhsId} /><Fact label="粉丝" value={displayMetric(facts.followers)} /><Fact label="关注" value={displayMetric(facts.following)} /><Fact label="获赞与收藏" value={displayMetric(facts.likesAndCollects)} /><Fact label="学校 / 公开标签" value={[facts.school, ...(facts.publicTags || [])].filter(Boolean).join(' · ')} /><div className="account-fact account-fact--wide"><span>简介</span><strong>{facts.bio || '暂无'}</strong></div><div className="account-fact account-fact--wide"><span>主页</span><strong>{facts.profileUrl || '暂无'}</strong></div></div> : <p className="account-muted">尚未同步小红书主页。</p>}</section>
      <section className="account-form-section"><div className="account-form-heading"><div><h2>AI 账号画像</h2><p>基于 {profile.recentContent?.count || 0} 条已保存本人笔记推断；字段可编辑，确认后不会被再次同步覆盖。</p>{facts && profile.recentContent?.count === 0 && <p className="account-profile-fallback-note">当前仅依据主页资料生成，补充历史笔记后可提高画像准确度。</p>}</div><div className="account-heading-actions"><span>{analysis?.profileConfidence === 'medium' ? '中等置信度' : analysis ? '低置信度' : '待分析'}</span><button className="button button--quiet" type="button" onClick={() => void reanalyze()} disabled={state === 'analyzing'}>{state === 'analyzing' ? '分析中…' : '重新分析'}</button><button className="button button--quiet" type="button" onClick={() => setEditing((value) => !value)}>{editing ? '收起编辑' : '编辑'}</button></div></div>{!editing ? <div className="account-profile-summary"><Fact label="账号定位" value={profile.positioning} /><Fact label="领域" value={profile.niche} /><Fact label="目标受众" value={profile.targetAudience} /><Fact label="价值承诺" value={lines(profile.accountPromise)} /><Fact label="内容支柱" value={lines(profile.contentPillars)} /><Fact label="优势" value={lines(profile.strengths)} /><Fact label="潜在问题" value={lines(profile.weaknesses)} /><Fact label="内容边界" value={lines(profile.contentBoundaries)} /></div> : <form onSubmit={save}><div className="account-form-grid">{fields.map(([key, label, placeholder]) => <label key={key}>{label}<input value={profile[key] || ''} onChange={(event) => setField(key, event.target.value)} placeholder={placeholder} /></label>)}{arrays.map(([key, label]) => <label key={key}>{label}<textarea value={lines(profile[key])} onChange={(event) => setField(key, event.target.value.split(/\r?\n/))} placeholder="每行一项" /></label>)}</div><div className="account-save-bar"><small>保存即表示确认当前编辑内容；不会自动认领匿名历史数据。</small><button className="button button--primary" type="submit" disabled={state === 'saving'}>{state === 'saving' ? '正在保存' : '确认账号画像'}</button></div></form>}</section>
    </div>}
  </>;
}
