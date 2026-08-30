import { useEffect, useState } from 'react';
import { getOpportunities } from '../api';
import { PageHeader } from '../components/PageHeader';
import { StatusTag } from '../components/StatusTag';

export function WritingSelectionPage({ onNavigate }) {
  const [selected, setSelected] = useState(null);
  useEffect(() => { getOpportunities().then((data) => setSelected((data.opportunities || []).find((item) => item.userState === 'selected') || null)).catch(() => {}); }, []);
  return <><PageHeader title="创作" description="本 Batch 只接收用户选择，不生成标题、Hook 或正文。" />
    <section className="page-placeholder"><div><strong>{selected ? selected.title : '尚未选择机会'}</strong><p>{selected ? '已选择机会，创作工作区将在下一 Batch 接入。' : '请先从机会页选择一个真实机会。'}</p>{selected?.manualOverride && <StatusTag tone="orange">人工选择，保留原 Decision 限制</StatusTag>}<button className="button button--secondary" onClick={() => onNavigate('opportunities')}>返回机会页</button></div></section></>;
}
