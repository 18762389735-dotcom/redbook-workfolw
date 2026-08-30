import { AccountHeader } from "./AccountHeader";
import { SidebarNav } from "./SidebarNav";
export function AppShell({ activePage, onNavigate, profile, updatedAt, children }) { return <div className="production-app"><SidebarNav activePage={activePage} onNavigate={onNavigate} /><main className="app-main"><AccountHeader profile={profile} updatedAt={updatedAt} onNavigate={onNavigate} /><div className="page-container">{children}</div></main></div>; }
