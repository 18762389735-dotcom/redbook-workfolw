import { useState } from 'react';
import { AppShell } from './components/AppShell';
import { DiscoverPage } from './pages/DiscoverPage';
import { BatchPlaceholderPage } from './pages/BatchPlaceholderPage';
const copy = { home: ['首页', '管理每日采集与内容运营节奏。'], opportunities: ['机会', '平台发现不会自动成为机会；等待后续 Matching 与 Decision。'], writing: ['创作', '本批次不实现创作或写作后端。'], knowledge: ['知识库', '本批次不实现知识库业务。'], account: ['我的账号', '账号资料与个人上下文不进入平台 Discovery。'], publishing: ['发布计划', '本批次不实现发布或自动发布。'], review: ['数据复盘', '本批次不实现数据复盘。'], settings: ['设置', '本地 Collector 的使用说明见 README。'] };
export function App() { const [activePage, setActivePage] = useState('home'); const content = activePage === 'discover' ? <DiscoverPage /> : <BatchPlaceholderPage title={copy[activePage][0]} description={copy[activePage][1]} />; return <AppShell activePage={activePage} onNavigate={setActivePage} profile={null} updatedAt={null}>{content}</AppShell>; }
