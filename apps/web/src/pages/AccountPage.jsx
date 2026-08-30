import { useEffect, useState } from 'react';
import { getAccount, updateAccount } from '../api';
import { PageHeader } from '../components/PageHeader';
import './account.css';

const fields = [
  ['displayName', '账号名称', '例如：我的设计实践'],
  ['positioning', '账号定位', '你希望持续提供什么内容'],
  ['niche', '领域 / Niche', '例如：设计实践、AI 工具'],
  ['targetAudience', '目标受众', '你希望帮助谁'],
];
const arrays = [
  ['contentPillars', '内容支柱'], ['accountPromise', '账号价值承诺'], ['strengths', '优势'], ['weaknesses', '弱项'],
  ['contentBoundaries', '内容边界'], ['privacyConstraints', '隐私约束'],
];
const contextArrays = [
  ['currentProjects', '当前项目'], ['currentTools', '当前工具'], ['currentLearning', '当前学习'], ['currentGoals', '当前目标'],
];
const lines = (value) => Array.isArray(value) ? value.join('\n') : '';
const empty = { displayName: '', positioning: '', niche: '', targetAudience: '', contentPillars: [], accountPromise: [], strengths: [], weaknesses: [], contentBoundaries: [], privacyConstraints: [], currentContext: { recentlyDoing: '', currentProjects: [], currentTools: [], currentLearning: [], currentGoals: [] } };

export function AccountPage({ onSaved }) {
  const [profile, setProfile] = useState(empty);
  const [state, setState] = useState('loading');
  const [message, setMessage] = useState('');
  useEffect(() => { getAccount().then((value) => { setProfile(value); setState('ready'); }).catch(() => setState('error')); }, []);
  const setField = (field, value) => setProfile((current) => ({ ...current, [field]: value }));
  const setContext = (field, value) => setProfile((current) => ({ ...current, currentContext: { ...current.currentContext, [field]: value } }));
  async function save(event) {
    event.preventDefault(); setState('saving'); setMessage('');
    try { const saved = await updateAccount(profile); setProfile(saved); setState('ready'); setMessage('账号资料已保存，Matching 将在读取机会时即时重算。'); onSaved?.(saved); }
    catch { setState('error'); setMessage('账号资料未保存，请稍后重试。'); }
  }
  return <>
    <PageHeader title="我的账号" description="只有你确认并保存的信息才会参与 Matching；不会从截图、历史或系统 Memory 推断。" />
    {message && <div className={state === 'error' ? 'page-message page-message--error' : 'page-message'}>{message}</div>}
    {state === 'loading' ? <div className="async-state async-state--loading"><div><strong>正在加载账号资料</strong></div></div> : <form className="account-workspace" onSubmit={save}>
      <section className="account-form-section"><div className="account-form-heading"><div><h2>长期账号资料</h2><p>决定“这个平台信号是否与账号有关”。</p></div><span>用户确认信息</span></div><div className="account-form-grid">
        {fields.map(([key, label, placeholder]) => <label key={key}>{label}<input value={profile[key] || ''} onChange={(event) => setField(key, event.target.value)} placeholder={placeholder} /></label>)}
        {arrays.map(([key, label]) => <label key={key}>{label}<textarea value={lines(profile[key])} onChange={(event) => setField(key, event.target.value.split(/\r?\n/))} placeholder="每行一项" /></label>)}
      </div></section>
      <section className="account-form-section"><div className="account-form-heading"><div><h2>当前状态</h2><p>单独判断“这件事现在是否与你有关”。</p></div></div><div className="account-form-grid">
        <label className="account-form-wide">最近在做什么<textarea value={profile.currentContext?.recentlyDoing || ''} onChange={(event) => setContext('recentlyDoing', event.target.value)} /></label>
        {contextArrays.map(([key, label]) => <label key={key}>{label}<textarea value={lines(profile.currentContext?.[key])} onChange={(event) => setContext(key, event.target.value.split(/\r?\n/))} placeholder="每行一项" /></label>)}
      </div></section>
      <div className="account-save-bar"><small>内容边界用于提示阻断；隐私约束只透传，不影响平台分数。</small><button className="button button--primary" type="submit" disabled={state === 'saving'}>{state === 'saving' ? '正在保存' : '保存账号资料'}</button></div>
    </form>}
  </>;
}
