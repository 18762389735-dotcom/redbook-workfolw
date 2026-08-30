const elements = {
  collect: document.querySelector('#collect'), creator: document.querySelector('#creator'), baseline: document.querySelector('#baseline'),
  limit: document.querySelector('#limit'), status: document.querySelector('#status'), progress: document.querySelector('#progress'),
  progressTitle: document.querySelector('#progress-title'), progressDetail: document.querySelector('#progress-detail'), cancel: document.querySelector('#cancel'),
};
let activeTaskId = null;
let timer = null;

function send(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, (reply) => {
    if (chrome.runtime.lastError) resolve({ error: chrome.runtime.lastError.message }); else resolve(reply || {});
  }));
}
function setBusy(value) { for (const key of ['collect', 'creator', 'baseline']) elements[key].disabled = value; }
function showError(message) { elements.status.className = 'error'; elements.status.textContent = message; setBusy(false); }
function renderTask(task) {
  if (!task) return;
  activeTaskId = task.id;
  const running = ['queued', 'running'].includes(task.status);
  elements.progress.classList.remove('hidden');
  elements.progressTitle.textContent = `${task.method} · ${task.status}`;
  elements.progressDetail.textContent = `进度 ${task.progress?.current || 0} / ${task.progress?.total || 0}；新增 ${task.result?.created || 0}，更新 ${task.result?.updated || 0}，重复 ${task.result?.duplicates || 0}，失败 ${task.failures?.length || 0}`;
  elements.cancel.classList.toggle('hidden', !running);
  setBusy(running);
  if (!running) {
    clearInterval(timer); timer = null;
    elements.status.className = task.status === 'failed' ? 'error' : '';
    elements.status.textContent = task.error || `任务已${task.status === 'completed' ? '完成' : task.status === 'partial' ? '部分完成' : '取消'}。`;
  }
}
async function refresh() { const reply = await send({ type: 'collector:status' }); if (reply.task) renderTask(reply.task); }
function beginPolling() { clearInterval(timer); timer = setInterval(refresh, 1000); refresh(); }

async function run(type) {
  setBusy(true); elements.status.className = ''; elements.status.textContent = '正在启动采集…';
  const message = { type };
  if (type === 'collector:baseline') message.limit = Math.min(20, Math.max(1, Number(elements.limit.value) || 12));
  const reply = await send(message);
  if (reply.error) return showError(reply.error);
  if (reply.task) renderTask(reply.task);
  if (type === 'collector:baseline') { elements.status.textContent = '后台任务已启动，关闭弹窗不会丢失进度。'; beginPolling(); }
  else { const result = reply.result || {}; elements.status.textContent = `已入库：新增 ${result.created || 0}，更新 ${result.updated || 0}，重复 ${result.duplicates || 0}。`; setBusy(false); }
}

elements.collect.addEventListener('click', () => run('collector:collect'));
elements.creator.addEventListener('click', () => run('collector:creator'));
elements.baseline.addEventListener('click', () => run('collector:baseline'));
elements.cancel.addEventListener('click', async () => { if (activeTaskId) await send({ type: 'collector:cancel', taskId: activeTaskId }); refresh(); });
beginPolling();
