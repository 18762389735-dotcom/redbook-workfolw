const tones = { red: "status-tag--red", green: "status-tag--green", orange: "status-tag--orange", blue: "status-tag--blue", neutral: "status-tag--neutral" };
export function StatusTag({ tone = "neutral", children }) { return <span className={`status-tag ${tones[tone] || tones.neutral}`}>{children}</span>; }
