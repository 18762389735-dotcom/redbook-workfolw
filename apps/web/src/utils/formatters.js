export function formatDateTime(value, fallback = "暂无记录") { if (!value) return fallback; const date = new Date(value); if (Number.isNaN(date.getTime())) return fallback; return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date); }
export function formatMetricValue(key, value) { if (value === null || value === undefined || value === "") return "未显示"; return String(value); }
export function metricLabel(key) { return key || "其他指标"; }
