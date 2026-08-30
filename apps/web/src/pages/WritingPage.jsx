import { useEffect, useMemo, useRef, useState } from "react";
import { addToPublishingPlan, checkDraft, createDraft, getWritingJob, humanizeDraft, restoreDraftVersion, saveDraft } from "../api/writing";
import { labelOf, topicRecommendationLabels, unknownTopicRecommendationLabel } from "../display-labels";
import { PageHeader } from "../components/PageHeader";
import { StatusTag } from "../components/StatusTag";
import { UiIcon } from "../components/UiIcon";
import "./writing.css";

const list = (value) => Array.isArray(value) ? value : [];
const text = (value, fallback = "暂无") => value === null || value === undefined || value === "" ? fallback : String(value)
  .replace(/\b(?:pattern|account-learning|topic-plan|knowledge|hot|viral|draft|material)-[\w-]+\b/gi, "相关依据")
  .replace(/\bmaturity\s*=\s*\w+\b/gi, "依据状态");
const draftWaitMs = 10 * 60 * 1000;
const pollDelayMs = 2400;
const versionLabels = { initial: "初稿", humanized: "AI 调整", "user-edited": "手工编辑", restored: "恢复版本" };
const factLabels = { supported: "有依据", needs_review: "建议确认", unsupported: "缺少依据", unavailable: "检查暂不可用" };

function selectedTopic(workspace) {
  return list(workspace?.topicPlan?.candidates).find((item) => item?.status === "selected") || null;
}

function materialName(id, materials) {
  return list(materials).find((item) => item?.materialId === id)?.name || null;
}

export function WritingPage({ workspace, onWorkspaceChanged, onNavigate, onDirtyChange }) {
  const draft = workspace?.draft || null;
  const topic = selectedTopic(workspace);
  const [idea, setIdea] = useState("");
  const [materialIds, setMaterialIds] = useState([]);
  const [body, setBody] = useState(draft?.body || "");
  const [title, setTitle] = useState(draft?.title || "");
  const [selectedHook, setSelectedHook] = useState(draft?.selectedHook || "");
  const [busy, setBusy] = useState("");
  const [pendingJob, setPendingJob] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const dirty = Boolean(draft && (body !== (draft.body || "") || title !== (draft.title || "")));
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirtyRef.current) {
      setBody(draft?.body || "");
      setTitle(draft?.title || "");
      setSelectedHook(draft?.selectedHook || "");
    }
  }, [draft?.body, draft?.title, draft?.selectedHook]);

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => {
    if (!pendingJob) return undefined;
    let active = true;
    let timer;
    const fail = () => {
      if (!active) return;
      setPendingJob(null);
      setError("这次处理没有完成，请重试。");
    };
    const poll = async () => {
      if (Date.now() >= pendingJob.deadline) return fail();
      try {
        const job = await getWritingJob(pendingJob.id);
        if (!active) return;
        if (job.status === "completed") {
          setPendingJob(null);
          await onWorkspaceChanged();
          if (active) setNotice(pendingJob.kind === "draft" ? "文案已生成。" : "表达已优化，已更新为当前版本。");
          return;
        }
        if (job.status === "failed") return fail();
      } catch {
        // Keep the existing draft and retry until the known deadline.
      }
      if (active) timer = window.setTimeout(poll, pollDelayMs);
    };
    poll();
    return () => { active = false; window.clearTimeout(timer); };
  }, [onWorkspaceChanged, pendingJob]);

  const sourceSummary = useMemo(() => {
    if (!draft?.writingContext) return null;
    const context = draft.writingContext;
    const materials = list(context.materials).map((item) => item?.name).filter(Boolean);
    const patterns = list(context.knowledgePatterns).map((item) => item?.name).filter(Boolean);
    return { context, materials, patterns };
  }, [draft]);

  const allBusy = Boolean(busy || pendingJob);
  const beginBusy = async () => {
    const sourceType = topic ? "topic_candidate" : "user_idea";
    if (!topic && !idea.trim()) { setError("请先写下今天想创作的内容。"); return; }
    setBusy("draft"); setError(""); setNotice("");
    try {
      const result = await createDraft({ sourceType, topicCandidateId: topic?.id, userIdea: topic ? undefined : idea.trim(), materialIds });
      if (!result?.id) throw new Error("missing-job");
      const startedAt = new Date(result.startedAt || result.createdAt || Date.now()).getTime();
      setPendingJob({ id: result.id, kind: "draft", deadline: Math.max(Date.now() + draftWaitMs, startedAt + draftWaitMs) });
      setNotice("正在生成文案，完成后会自动更新。");
    } catch { setError("这次处理没有完成，请重试。"); }
    finally { setBusy(""); }
  };

  const save = async () => {
    if (!draft || !title.trim() || !body.trim()) { setError("标题和正文不能为空。"); return; }
    setBusy("save"); setError(""); setNotice("");
    try { await saveDraft({ title: title.trim(), body: body.trim() }); await onWorkspaceChanged(); setNotice("草稿已保存。"); }
    catch { setError("这次处理没有完成，请重试。"); }
    finally { setBusy(""); }
  };

  const runHumanize = async () => {
    if (!draft) return;
    setBusy("humanize"); setError(""); setNotice("");
    try {
      const result = await humanizeDraft();
      if (!result?.id) throw new Error("missing-job");
      const startedAt = new Date(result.startedAt || result.createdAt || Date.now()).getTime();
      setPendingJob({ id: result.id, kind: "humanize", deadline: Math.max(Date.now() + draftWaitMs, startedAt + draftWaitMs) });
      setNotice("正在优化表达，完成后会自动更新。");
    } catch { setError("这次处理没有完成，请重试。"); }
    finally { setBusy(""); }
  };

  const runCheck = async (type) => {
    if (!draft) return;
    setBusy(type); setError(""); setNotice("");
    try { await checkDraft(); await onWorkspaceChanged(); setNotice(type === "fact" ? "事实检查已更新。" : "账号一致性已更新。"); }
    catch { setError("这次处理没有完成，请重试。"); }
    finally { setBusy(""); }
  };

  const restore = async (index) => {
    setBusy(`restore-${index}`); setError(""); setNotice("");
    try { await restoreDraftVersion(index); await onWorkspaceChanged(); setNotice("已恢复该版本。"); }
    catch { setError("这次处理没有完成，请重试。"); }
    finally { setBusy(""); }
  };

  const addPlan = async () => {
    setBusy("plan"); setError(""); setNotice("");
    try { await addToPublishingPlan(); await onWorkspaceChanged(); setNotice("已加入发布计划。不会执行平台发布。"); }
    catch { setError("这次处理没有完成，请重试。"); }
    finally { setBusy(""); }
  };

  const titleCandidates = list(draft?.titleCandidates);
  const hooks = list(draft?.hookCandidates);
  const publishingAdded = draft?.status === "publishing_plan" || list(workspace?.publishingPlan?.posts).some((post) => post?.sourceDraftId === draft?.id || post?.draftId === draft?.id);
  return <>
    <PageHeader title="文案创作" description="把选题真正写成可发布的小红书文案。" />
    {(notice || error) && <div className={error ? "page-message page-message--error" : "page-message"}>{error || notice}</div>}
    {!draft ? <section className="writing-empty">
      <div className="writing-source"><StatusTag tone="red">{topic ? "来源：选题计划" : "来源：我的想法"}</StatusTag>{topic ? <div><strong>{text(topic.topic, "已选择选题")}</strong><span>推荐角度：{text(topic.angle, "暂无")}</span></div> : null}</div>
      <h2>{topic ? "已选择选题，还没有生成文案" : "今天想写什么？"}</h2>
      {topic ? <p>确认后点击开始创作，系统才会开始生成。</p> : <><textarea value={idea} onChange={(event) => setIdea(event.target.value)} placeholder="例如：记录一次真实的项目推进，或分享一个正在验证的工作方法。" maxLength={3000} disabled={allBusy} /><p>可选择真实材料；不选择也能基于你的主题和账号信息开始创作。</p><MaterialSelect materials={workspace?.accountMaterials} selected={materialIds} onChange={setMaterialIds} disabled={allBusy} /></>}
      <button className="button button--primary" onClick={beginBusy} disabled={allBusy}>{busy === "draft" || pendingJob?.kind === "draft" ? "正在生成文案" : "开始创作"}</button>
    </section> : <section className="writing-layout">
      <div className="writing-main-column">
        <SourceBand source={sourceSummary} topic={topic} />
        <CandidateSection label="标题候选" icon="writing" empty="暂无标题方案" className="writing-titles">
          {titleCandidates.length ? <div className="title-candidate-list">{titleCandidates.map((item, index) => {
            const value = typeof item === "string" ? item : item?.text;
            const active = title === value;
            return <button key={`${value}-${index}`} className={active ? "title-candidate title-candidate--selected" : "title-candidate"} onClick={() => setTitle(value || "")} disabled={allBusy}>
              <b>{index + 1}</b><span>{text(value, "未命名标题")}</span>{item?.recommendationType ? <StatusTag tone={item.recommendationType === "recommended" ? "red" : "blue"}>{labelOf(topicRecommendationLabels, item.recommendationType, unknownTopicRecommendationLabel)}</StatusTag> : null}{active ? <i>当前选中</i> : null}
            </button>;
          })}</div> : null}
          {titleCandidates.some((item) => item?.rationale) ? <details className="writing-rationale"><summary>为什么推荐</summary>{titleCandidates.map((item, index) => item?.rationale ? <p key={index}>标题 {index + 1}：{text(item.rationale)}</p> : null)}</details> : null}
        </CandidateSection>
        <CandidateSection label="Hook" icon="hot" empty="暂无开头方案" className="writing-hooks">
          {hooks.length ? <div className="hook-candidate-list">{hooks.map((item, index) => {
            const value = typeof item === "string" ? item : item?.text;
            const active = selectedHook === value;
            return <button key={`${value}-${index}`} className={active ? "hook-candidate hook-candidate--selected" : "hook-candidate"} onClick={() => setSelectedHook(value || "")} disabled={allBusy}><b>{index + 1}</b><span>{text(value, "暂无开头内容")}</span>{active ? <i>当前参考</i> : null}</button>;
          })}</div> : null}
          <p className="writing-hint">开头方案可作为编辑参考；当前选择不会单独保存。</p>
        </CandidateSection>
        <CandidateSection label="推荐结构" icon="topic" empty="暂无结构建议" className="writing-structure">
          <Structure value={draft?.structure} />
        </CandidateSection>
        <section className="writing-editor-card"><div className="writing-section-heading"><span className="section-symbol"><UiIcon name="writing" size={18} /></span><div><h2>正文编辑器</h2><p>{dirty ? "未保存" : "已保存"}</p></div><small>{body.length} 字</small></div><label className="writing-title-input">标题<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={20} disabled={allBusy} /></label><textarea className="writing-body-input" value={body} onChange={(event) => setBody(event.target.value)} disabled={allBusy} spellCheck="false" /></section>
      </div>
      <aside className="writing-assistant"><h2>AI 辅助</h2><p>只提供当前本地工作台已有的处理能力。</p><AssistantButton icon="writing" label="优化表达" detail="让文字更自然、保留原意" onClick={runHumanize} disabled={allBusy} loading={busy === "humanize" || pendingJob?.kind === "humanize"} /><AssistantButton icon="topic" label="检查事实" detail="查看文本中需要确认的说法" onClick={() => runCheck("fact")} disabled={allBusy} loading={busy === "fact"} /><AssistantButton icon="account" label="检查账号一致性" detail="按账号定位与已有材料检查" onClick={() => runCheck("account")} disabled={allBusy} loading={busy === "account"} />
        <CheckSummary factCheck={draft?.factCheck} consistency={draft?.accountConsistency} />
        <button className="writing-version-toggle" onClick={() => setVersionsOpen(!versionsOpen)} disabled={allBusy}>{versionsOpen ? "收起版本历史" : "查看版本历史"}</button>
        {versionsOpen ? <VersionHistory versions={draft?.versions} onRestore={restore} busy={busy} /> : null}
      </aside>
    </section>}
    {draft ? <div className="writing-footer"><span>{dirty ? "有未保存的修改" : "当前草稿已保存"}</span><button className="button button--secondary" onClick={save} disabled={allBusy || !dirty}>{busy === "save" ? "正在保存" : "保存草稿"}</button><button className="button button--secondary" onClick={() => setPreviewOpen(true)} disabled={allBusy}>文本预览</button><button className="button button--primary" onClick={addPlan} disabled={allBusy || publishingAdded}>{publishingAdded ? "已加入发布计划" : busy === "plan" ? "正在加入" : "加入发布计划"}</button></div> : null}
    {previewOpen && draft ? <Preview title={title} body={body} onClose={() => setPreviewOpen(false)} /> : null}
  </>;
}

function MaterialSelect({ materials, selected, onChange, disabled }) { const all = list(materials); if (!all.length) return <p className="writing-no-material">当前没有可选的真实材料，仍可正常创作。</p>; return <div className="writing-material-select"><strong>选择我的真实材料（可选）</strong>{all.slice(0, 3).map((item) => <label key={item.materialId}><input type="checkbox" checked={selected.includes(item.materialId)} disabled={disabled} onChange={(event) => onChange(event.target.checked ? [...selected, item.materialId].slice(0, 3) : selected.filter((id) => id !== item.materialId))} />{text(item.name, "未命名材料")}</label>)}</div>; }
function SourceBand({ source, topic }) { if (!source) return null; const { context, materials, patterns } = source; return <section className="writing-source-band"><StatusTag tone="red">来源：{context.sourceType === "topic_candidate" ? "选题计划" : "我的想法"}</StatusTag><strong>{text(context.topic?.topic || topic?.topic, "当前创作主题")}</strong><div>{materials.length ? <span>使用 {materials.length} 份你的真实材料</span> : null}{patterns.length ? <span>参考 {patterns.length} 条内容方法</span> : null}{list(context.accountLearnings).length ? <span>参考了你账号此前的真实表现</span> : null}</div>{(materials.length || patterns.length) ? <details><summary>查看依据</summary>{materials.map((name) => <p key={name}>你的材料：{text(name)}</p>)}{patterns.map((name) => <p key={name}>内容方法：{text(name)}</p>)}</details> : null}</section>; }
function CandidateSection({ label, icon, empty, children, className = "" }) { return <section className={`writing-section ${className}`}><div className="writing-section-heading"><span className="section-symbol"><UiIcon name={icon} size={18} /></span><h2>{label}</h2></div>{children || <p className="writing-empty-copy">{empty}</p>}</section>; }
function Structure({ value }) { if (!value) return <p className="writing-empty-copy">暂无结构建议</p>; const steps = list(value.steps); if (steps.length) return <div className="structure-steps">{steps.map((step, index) => <span key={`${step}-${index}`}>{text(step)}</span>)}</div>; return <p className="structure-text">{text(typeof value === "string" ? value : value.text, "暂无结构建议")}</p>; }
function AssistantButton({ icon, label, detail, onClick, disabled, loading }) { return <button className="assistant-action" onClick={onClick} disabled={disabled}><span className="section-symbol"><UiIcon name={icon} size={17} /></span><span><b>{loading ? `正在${label}…` : label}</b><small>{detail}</small></span><i>›</i></button>; }
function CheckSummary({ factCheck, consistency }) { return <div className="check-summary">{factCheck ? <details><summary>事实检查：{factLabels[factCheck.status] || "建议确认"}</summary>{list(factCheck.items).length ? list(factCheck.items).map((item, index) => <p key={index}><b>{text(item.text)}</b> · {factLabels[item.status] || "建议确认"}<br />{text(item.reason)}</p>) : <p>当前没有需要单独列出的内容。</p>}</details> : <p>还未进行事实检查</p>}{consistency ? <details><summary>账号一致性：{consistency.status === "supported" ? "与当前账号定位一致" : "建议确认"}</summary><p>{text(consistency.message)}</p></details> : <p>还未进行账号一致性检查</p>}</div>; }
function VersionHistory({ versions, onRestore, busy }) { const history = list(versions); return <div className="version-history">{history.length ? history.map((version, index) => <article key={`${version.createdAt}-${index}`}><b>{versionLabels[version.kind] || "历史版本"}</b><span>{text(version.title, "未命名标题")}</span><button onClick={() => onRestore(index)} disabled={busy !== ""}>{busy === `restore-${index}` ? "正在恢复" : "恢复此版本"}</button></article>) : <p>暂无历史版本</p>}</div>; }
function Preview({ title, body, onClose }) { return <div className="writing-preview-backdrop" role="dialog" aria-modal="true" aria-label="文本预览"><section className="writing-preview"><button className="preview-close" onClick={onClose} aria-label="关闭预览">×</button><small>文本预览</small><h2>{text(title, "未命名标题")}</h2><div>{text(body, "暂无正文")}</div></section></div>; }
