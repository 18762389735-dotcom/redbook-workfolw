import { UiIcon } from "./UiIcon";
// Migrated from redbook/src/components/SidebarNav.jsx; labels adapted for Batch 01.
// v0.1 用户主流程：真实素材 → 机会 → 创作 → 复盘。
// 旧页面仍保留在代码中，暂不作为独立主导航入口。
const items = [["discover", "素材", "hot"], ["opportunities", "机会", "topic"], ["writing", "创作", "writing"], ["review", "复盘", "review"], ["settings", "设置", "settings"]];
export function SidebarNav({ activePage, onNavigate }) { return <aside className="sidebar" aria-label="主导航"><div className="sidebar-brand"><img src="/project-logo.png" alt="" /><span>小红书AI运营工作台</span></div><nav className="sidebar-nav">{items.map(([key, label, icon]) => <button key={key} className={activePage === key ? "sidebar-item sidebar-item--active" : "sidebar-item"} onClick={() => onNavigate(key)}><UiIcon name={icon} /><span>{label}</span></button>)}</nav></aside>; }
