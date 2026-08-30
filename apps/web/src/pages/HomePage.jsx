import { DataCard } from "../components/DataCard";
import { PageHeader } from "../components/PageHeader";
import { StatusTag } from "../components/StatusTag";
import { formatDateTime } from "../utils/formatters";

const count = (items, predicate = () => true) => (items || []).filter(predicate).length;

export function HomePage({ workspace, onNavigate }) {
  const hotCount = count(workspace.hotContent?.candidates) || count(workspace.xhsRead?.candidates);
  const topicCount = count(workspace.topicPlan?.candidates, (item) => item.status !== "dismissed");
  const hasDraft = Boolean(workspace.draft?.title || workspace.draft?.body);
  const reviewCount = count(workspace.publishingPlan?.posts, (post) => post.status === "review_pending");
  const profile = workspace.accountProfile || {};
  const recentlyDoing = workspace.currentContext?.recentlyDoing;
  const latestSnapshot = [...(workspace.accountSnapshots || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  const connectionStatus = workspace.xhsRead?.status === "CONNECTED" ? "检索小号已连接" : "检索小号未连接";
  const reminders = [hasDraft && ["文案正在创作中", "继续完善标题、正文或事实依据", "writing"], reviewCount > 0 && [`${reviewCount} 篇内容等待复盘`, "上传小红书创作平台真实后台截图", "review"], !hotCount && ["本轮暂未发现热点候选", "连接检索小号后开始检索", "hot"], !topicCount && ["还没有本期选题", "补充近期状态后生成选题", "topics"]].filter(Boolean).slice(0, 4);

  return <>
    <PageHeader title="首页" description="我的主账号运营驾驶舱" />
    <section className="overview-card"><div className="overview-heading"><div><span className="section-symbol">●</span><h2>账号概况</h2></div><StatusTag tone="neutral">本地数据</StatusTag></div><div className="overview-grid"><div><span>账号定位</span><strong>{profile.positioning || "暂未填写"}</strong><small>{profile.accountPromise || "补充定位后，选题与创作会更贴近账号。"}</small></div><div><span>垂直方向</span><strong>{profile.niche || "暂未填写"}</strong><small>{profile.targetAudience || "暂未填写目标受众"}</small></div><div><span>最近在做什么</span><strong>{recentlyDoing || "暂无记录"}</strong><small>最近更新：{formatDateTime(workspace.currentContext?.updatedAt, "暂无更新")}</small></div><div><span>账号数据</span><strong>{latestSnapshot ? "已更新" : "尚未更新"}</strong><small>{latestSnapshot ? `最近快照：${formatDateTime(latestSnapshot.createdAt)}` : "上传材料后可更新账号数据"}</small></div></div></section>
    <section className="dashboard-grid" aria-label="运营概览"><DataCard icon="hot" title="热点 / 爆款" value={hotCount} description={hotCount ? "条真实候选可供判断" : "本轮暂无候选"} action="查看全部" onClick={() => onNavigate("hot")} /><DataCard icon="topic" title="推荐选题" value={topicCount} description={topicCount ? "个方向等待你选择" : "还没有选题计划"} tone="blue" action="查看选题" onClick={() => onNavigate("topics")} /><DataCard icon="writing" title="正在进行" value={hasDraft ? "1" : "0"} description={hasDraft ? "篇文案正在创作" : "暂无进行中的文案"} tone="green" action="查看详情" onClick={() => onNavigate("writing")} /><DataCard icon="review" title="待复盘" value={reviewCount} description={reviewCount ? "篇内容等待补充数据" : "暂无待复盘内容"} tone="orange" action="去复盘" onClick={() => onNavigate("review")} /></section>
    <section className="today-card"><div className="today-heading"><div><span className="section-symbol">●</span><h2>今日需要处理</h2></div><StatusTag tone={workspace.xhsRead?.status === "CONNECTED" ? "green" : "orange"}>{connectionStatus}</StatusTag></div><div className="today-list">{reminders.map(([title, detail, page]) => <button key={page} className="today-row" onClick={() => onNavigate(page)}><span /><div><strong>{title}</strong><small>{detail}</small></div><b>›</b></button>)}{reminders.length === 0 && <div className="today-empty">当前没有待处理事项。</div>}</div></section>
  </>;
}
