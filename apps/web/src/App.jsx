import { useEffect, useState } from 'react';
import { AppShell } from './components/AppShell';
import { DiscoverPage } from './pages/DiscoverPage';
import { BatchPlaceholderPage } from './pages/BatchPlaceholderPage';
import { AccountPage } from './pages/AccountPage';
import { OpportunityPage } from './pages/OpportunityPage';
import { WritingSelectionPage } from './pages/WritingSelectionPage';
import { ReviewPage } from './pages/ReviewPage';
import { getAccount } from './api';
const copy = { home: ['首页', '管理每日采集与内容运营节奏。'], knowledge: ['知识库', '本批次不实现知识库业务。'], publishing: ['发布计划', '本批次不实现发布或自动发布。'], settings: ['设置', '本地 Collector 的使用说明见 README。'] };
export function App() {
  const [activePage, setActivePage] = useState('discover'); const [profile, setProfile] = useState(null);
  useEffect(() => { getAccount().then(setProfile).catch(() => {}); }, []);
  let content;
  if (activePage === 'discover') content = <DiscoverPage onNavigate={setActivePage} />;
  else if (activePage === 'account') content = <AccountPage onSaved={setProfile} />;
  else if (activePage === 'opportunities') content = <OpportunityPage onNavigate={setActivePage} />;
  else if (activePage === 'writing') content = <WritingSelectionPage onNavigate={setActivePage} />;
  else if (activePage === 'review') content = <ReviewPage />;
  else content = <BatchPlaceholderPage title={copy[activePage][0]} description={copy[activePage][1]} />;
  return <AppShell activePage={activePage} onNavigate={setActivePage} profile={profile} updatedAt={profile?.updatedAt}>{content}</AppShell>;
}
