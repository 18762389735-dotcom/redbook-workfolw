import { PageHeader } from '../components/PageHeader';
export function BatchPlaceholderPage({ title, description }) { return <><PageHeader title={title} description={description} /><section className="hot-empty-state"><strong>此页面的既有界面已迁入</strong><p>业务后端属于后续 Batch；本批次不伪造数据，也不启动 Agent 分析。</p></section></>; }
