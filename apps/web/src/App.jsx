import { useState } from 'react';
import { AppShell } from './components/AppShell';
import { DiscoverPage } from './pages/DiscoverPage';
import { BatchPlaceholderPage } from './pages/BatchPlaceholderPage';
const copy = { home: ['首页', '管理每日采集与内容运营节奏。'], opportunities: ['机会', 'Batch 02 才会建立机会判断。'], writing: ['创作', 'Batch 03 才会接入可保存的创作工作区。'], knowledge: ['知识库', 'Batch 02 才会将已采集内容沉淀为可编辑知识。'], account: ['我的账号', '账号资料与连接配置将在后续批次完成。'], publishing: ['发布计划', '本批次不实现发布或自动发布。'], review: ['数据复盘', '本批次不实现数据复盘。'], settings: ['设置', '本地 Collector 的使用说明见 README。'] };
export function App() { const [activePage, setActivePage] = useState('home'); const content = activePage === 'discover' ? <DiscoverPage /> : <BatchPlaceholderPage title={copy[activePage][0]} description={copy[activePage][1]} />; return <AppShell activePage={activePage} onNavigate={setActivePage} profile={null} updatedAt={null}>{content}</AppShell>; }
