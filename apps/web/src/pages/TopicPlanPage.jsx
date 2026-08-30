import { useEffect, useMemo, useState } from "react";
import { getTopicRecommendationStatus, recommendTopics, updateTopicStatus } from "../api/topic-plan";
import { labelOf, topicRecommendationLabels, topicStatusLabels, unknownTopicRecommendationLabel } from "../display-labels";
import { PageHeader } from "../components/PageHeader";
import { StatusTag } from "../components/StatusTag";
import { UiIcon } from "../components/UiIcon";
import "./topic-plan.css";

const display = (value, fallback = "暂无") => value === null || value === undefined || value === "" ? fallback : value;
const asList = (value) => Array.isArray(value) ? value : [];
// Recommendation text is stored with traceability references. Keep those internal
// identifiers out of the creator-facing workspace while preserving the actual caveat.
const creatorText = (value, fallback = "暂无") => String(display(value, fallback))
  .replace(/\baccount-learning-[\w-]+\b/gi, "一条待验证的账号观察")
  .replace(/\b(?:topic-plan|knowledge|hot|viral|draft|material)-[\w-]+\b/gi, "相关依据")
  .replace(/\bCurrentContext\b/g, "近期状态");

function referenceNames(ids, records, idKey, labelKeys) {
  const keys = Array.isArray(labelKeys) ? labelKeys : [labelKeys];
  return asList(ids).map((id) => {
    const record = asList(records).find((item) => item?.[idKey] === id || item?.id === id);
    return keys.map((key) => record?.[key]).find((value) => value !== null && value !== undefined && value !== "");
  }).filter(Boolean);
}

function recommendationTone(type) {
  if (type === "recommended") return "red";
  if (type === "experiment") return "blue";
  return "neutral";
}

const recommendationWaitMs = 8 * 60 * 1000;
const pollDelayMs = 2500;

export function TopicPlanPage({ workspace, onWorkspaceChanged, onNavigate }) {
  const topicPlan = workspace?.topicPlan || {};
  const [intent, setIntent] = useState(topicPlan.userIntent || "");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pendingRecommendation, setPendingRecommendation] = useState(null);

  useEffect(() => setIntent(topicPlan.userIntent || ""), [topicPlan.userIntent]);

  const candidates = useMemo(() => asList(topicPlan.candidates).filter((candidate) => candidate?.status !== "dismissed").slice(0, 4), [topicPlan.candidates]);
  const currentFocus = workspace?.currentContext?.recentlyDoing;
  const interactionBusy = busy !== "" || Boolean(pendingRecommendation);

  useEffect(() => {
    if (!pendingRecommendation) return undefined;
    let active = true;
    let timer;
    const fail = (message) => {
      if (!active) return;
      setPendingRecommendation(null);
      setError(message);
    };
    const check = async () => {
      if (Date.now() >= pendingRecommendation.deadline) return fail("选题生成超时，请稍后重试。");
      try {
        const result = await getTopicRecommendationStatus(pendingRecommendation.jobId);
        if (!active) return;
        if (result.status === "completed") {
          setPendingRecommendation(null);
          await onWorkspaceChanged();
          if (active) setNotice("选题已更新。");
          return;
        }
        if (result.status === "failed") return fail("选题暂未生成，请稍后重试。");
      } catch {
        // Keep polling until the known deadline; technical details are never shown to users.
      }
      if (active) timer = window.setTimeout(check, pollDelayMs);
    };
    check();
    return () => { active = false; window.clearTimeout(timer); };
  }, [onWorkspaceChanged, pendingRecommendation]);

  async function refreshAfter(action, success, key) {
    setBusy(key);
    setNotice("");
    setError("");
    try {
      await action();
      await onWorkspaceChanged();
      setNotice(success);
      return true;
    } catch {
      setError("操作未完成，请稍后重试。");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function generate(event) {
    event.preventDefault();
    if (!intent.trim()) {
      setError("请先写下这次想创作的内容方向。");
      return;
    }
    setBusy("generate");
    setNotice("");
    setError("");
    try {
      const result = await recommendTopics(intent.trim());
      if (!result?.id) throw new Error("missing result");
      const startedAt = new Date(result.startedAt || result.createdAt || Date.now()).getTime();
      setPendingRecommendation({ jobId: result.id, deadline: Math.max(Date.now() + recommendationWaitMs, startedAt + recommendationWaitMs) });
      setNotice("正在生成选题，完成后会自动更新。");
    } catch {
      setError("选题暂未生成，请稍后重试。");
    } finally {
      setBusy("");
    }
  }

  const saveStatus = (candidate, status, success) => refreshAfter(
    () => updateTopicStatus(candidate.id, status),
    success,
    `${status}-${candidate.id}`,
  );

  async function startWriting(candidate) {
    const saved = await saveStatus(candidate, "selected", "已选择这个选题，可继续进入文案创作。");
    if (saved) onNavigate("writing");
  }

  return <>
    <PageHeader title="选题计划" description="结合你的近期实践、账号定位与已有依据，推荐本期值得尝试的内容方向。" />
    {(notice || error) && <div className={error ? "page-message page-message--error" : "page-message"}>{error || notice}</div>}
    <form className="topic-intent-card" onSubmit={generate}>
      <div className="topic-intent-heading">
        <span className="section-symbol"><UiIcon name="topic" size={18} /></span>
        <div><h2>这次想写什么？</h2><p>先确认你正在做的事情，再补充这一篇想表达的方向。</p></div>
      </div>
      <div className="topic-intent-grid">
        <label>我最近在做什么？
          <textarea value={display(currentFocus, "暂无近期记录")} readOnly aria-readonly="true" />
          <button className="topic-context-link" type="button" onClick={() => onNavigate("account")}>去“我的账号”更新近期状态</button>
        </label>
        <label>我现在想写什么？
          <textarea value={intent} onChange={(event) => setIntent(event.target.value)} placeholder="例如：想记录一个正在推进的项目，或拆解一次真实工作中的判断。" maxLength={3000} />
          <small>这段内容只用于生成本期选题，不会替代你的账号资料。</small>
        </label>
      </div>
      <div className="topic-intent-actions"><button className="button button--primary" type="submit" disabled={interactionBusy}>{busy === "generate" || pendingRecommendation ? "正在生成" : "生成选题"}</button></div>
    </form>
    <section className="topic-section">
      <div className="topic-section-heading"><div><h2>本期推荐选题</h2><p>每次最多展示 4 个，选择后可继续进入写作。</p></div>{topicPlan.updatedAt ? <StatusTag tone="neutral">已更新</StatusTag> : null}</div>
      {!candidates.length ? <div className="topic-empty"><strong>暂无本期选题</strong><p>补充你想写的方向后，点击“生成选题”即可开始。</p></div> : <div className="topic-card-grid">{candidates.map((candidate) => <TopicCard key={candidate.id} candidate={candidate} workspace={workspace} busy={interactionBusy ? busy || "generating" : ""} onSave={saveStatus} onStart={startWriting} />)}</div>}
    </section>
  </>;
}

function TopicCard({ candidate, workspace, busy, onSave, onStart }) {
  const knowledgeNames = referenceNames(candidate.supportingKnowledgeIds, workspace?.knowledge?.items, "id", "title");
  const materialIds = asList(candidate.supportingMaterialIds);
  const materialNames = referenceNames(materialIds, workspace?.accountMaterials, "materialId", ["name", "title", "originalName"]);
  const materialEvidence = materialNames.length ? materialNames : materialIds.length ? [`${materialIds.length} 份你的真实材料`] : [];
  const hotNames = referenceNames(candidate.supportingHotContentIds, workspace?.hotContent?.candidates, "id", "title");
  const evidenceLimits = asList(candidate.evidenceLimits);
  const riskNotes = asList(candidate.riskNotes);
  const hasSources = knowledgeNames.length || materialEvidence.length || hotNames.length || asList(candidate.supportingViralAnalysisIds).length;
  const selected = candidate.status === "selected";
  const saved = candidate.status === "saved";
  const busyFor = (status) => busy === `${status}-${candidate.id}`;
  return <article className={selected ? "topic-card topic-card--selected" : "topic-card"}>
    <div className="topic-card-top"><StatusTag tone={recommendationTone(candidate.recommendationType)}>{labelOf(topicRecommendationLabels, candidate.recommendationType, unknownTopicRecommendationLabel)}</StatusTag>{selected || saved ? <StatusTag tone={selected ? "green" : "blue"}>{labelOf(topicStatusLabels, candidate.status, "已记录")}</StatusTag> : null}</div>
    <h3>{display(candidate.topic, "未命名选题")}</h3>
    <div className="topic-card-block"><strong>推荐角度</strong><p>{creatorText(candidate.angle, "暂无建议角度")}</p></div>
    <div className="topic-card-block"><strong>为什么现在</strong><p>{creatorText(candidate.whyNow, "暂无可用说明")}</p></div>
    <div className="topic-card-block"><strong>为什么适合你</strong><p>{creatorText(candidate.whyFitAccount, "暂无可用说明")}</p></div>
    <div className="topic-evidence"><strong>真实依据</strong>{hasSources ? <ul>{knowledgeNames.map((name) => <li key={`knowledge-${name}`}>已沉淀内容：{name}</li>)}{materialEvidence.map((name) => <li key={`material-${name}`}>账号材料：{name}</li>)}{hotNames.map((name) => <li key={`hot-${name}`}>公开内容观察：{name}</li>)}{asList(candidate.supportingViralAnalysisIds).length ? <li>已参考公开内容的观察结论</li> : null}</ul> : <p>当前主要依据为账号定位与近期状态。</p>}</div>
    <div className="topic-evidence topic-evidence--materials"><strong>你的材料</strong>{materialEvidence.length ? <ul>{materialEvidence.map((name) => <li key={name}>{name}</li>)}</ul> : <p>当前未引用账号材料。</p>}</div>
    {(evidenceLimits.length || riskNotes.length) ? <div className="topic-boundaries">{evidenceLimits.length ? <p><strong>当前限制：</strong>{creatorText(evidenceLimits[0])}</p> : null}{riskNotes.length ? <p><strong>写作提醒：</strong>{creatorText(riskNotes[0])}</p> : null}</div> : null}
    <div className="topic-direction-grid"><div><strong>标题方向</strong><p>{creatorText(candidate.titleDirection, "暂无标题方向")}</p></div><div><strong>Hook</strong><p>{creatorText(candidate.hookDirection, "暂无开头方向")}</p></div><div className="topic-direction-grid__wide"><strong>结构</strong><p>{creatorText(candidate.structureDirection, "暂无结构方向")}</p></div></div>
    <details className="topic-why"><summary>为什么推荐我</summary><div><p>当前时机：{creatorText(candidate.whyNow, "暂无可用说明")}</p><p>账号匹配：{creatorText(candidate.whyFitAccount, "暂无可用说明")}</p><p>依据情况：{hasSources ? "已引用近期状态、账号材料或已沉淀内容。" : "当前主要依据为账号定位与近期状态。"}</p>{evidenceLimits.map((item) => <p key={item}>判断边界：{creatorText(item)}</p>)}{riskNotes.map((item) => <p key={item}>写作提醒：{creatorText(item)}</p>)}</div></details>
    <div className="topic-card-actions"><button className="button button--primary" onClick={() => onStart(candidate)} disabled={busy !== ""}>{busyFor("selected") ? "正在选择" : "开始写"}</button><button className="button button--secondary" onClick={() => onSave(candidate, "saved", "已收藏这个选题。") } disabled={busy !== ""}>{busyFor("saved") ? "正在收藏" : saved ? "已收藏" : "收藏"}</button><button className="topic-dismiss" onClick={() => onSave(candidate, "dismissed", "已标记为不感兴趣。") } disabled={busy !== ""}>{busyFor("dismissed") ? "正在处理" : "不感兴趣"}</button></div>
  </article>;
}
