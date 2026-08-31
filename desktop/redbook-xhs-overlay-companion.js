/*
 * Redbook-owned companion for the unsupported XHS search profile overlay.
 * Beav owns supported note/profile surfaces; this file only binds an explicit
 * user click to a canonical profile ID supplied by the XHS page state.
 */
(() => {
  const ROOT_ID = 'redbook-collector-overlay-companion';
  const TTL_MS = 10_000;
  let generation = 0;
  let context = null;
  let timer = null;
  let host = null;

  function invalidate() {
    generation += 1;
    context = null;
    if (timer) { clearTimeout(timer); timer = null; }
    host?.remove?.();
    host = null;
  }

  function profileFromNode(node) {
    const anchor = node?.closest?.('a[href]') || (node?.tagName === 'A' ? node : null);
    if (!anchor) return null;
    let url;
    try { url = new URL(anchor.getAttribute('href') || '', location.origin); } catch { return null; }
    if (!/(^|\.)xiaohongshu\.com$|(^|\.)rednote\.com$/i.test(url.hostname)) return null;
    const match = url.pathname.match(/^\/user\/profile\/([^/?#]+)$/i);
    if (!match?.[1]) return null;
    return { profileId: match[1], pathname: `/user/profile/${match[1]}`, observedAt: Date.now() };
  }

  function nearestProfile(path) {
    for (const node of path || []) {
      const result = profileFromNode(node);
      if (result) return result;
    }
    return null;
  }

  function render(creator) {
    host?.remove?.();
    host = document.createElement('div');
    host.id = ROOT_ID;
    host.dataset.redbookCollector = 'search-profile-overlay';
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; position: fixed; z-index: 2147483646; right: 24px; bottom: 88px; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif; }
      .card { width: 190px; box-sizing: border-box; padding: 12px; border: 1px solid #f1d6da; border-radius: 12px; background: #fffafa; color: #33272b; box-shadow: 0 8px 26px rgba(75,26,35,.18); }
      .label { color: #8d6570; font-size: 12px; margin-bottom: 5px; } .name { font-size: 15px; font-weight: 700; margin-bottom: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      button { width: 100%; border: 0; border-radius: 8px; padding: 8px 9px; color: #fff; background: #ff2442; cursor: pointer; font-size: 13px; } button:disabled { opacity: .65; cursor: wait; }
      .status { color: #9a6873; font-size: 11px; margin-top: 7px; min-height: 14px; }
    `;
    const card = document.createElement('div'); card.className = 'card';
    const label = document.createElement('div'); label.className = 'label'; label.textContent = '已识别博主';
    const name = document.createElement('div'); name.className = 'name'; name.textContent = creator.nickname || creator.profileId;
    const button = document.createElement('button'); button.type = 'button'; button.textContent = '采集当前博主';
    const status = document.createElement('div'); status.className = 'status';
    button.addEventListener('click', async (event) => {
      event.preventDefault(); event.stopPropagation(); button.disabled = true; status.textContent = '采集中…';
      try {
        const response = await chrome.runtime.sendMessage({ type: 'redbook:xhs:collect-confirmed-creator', payload: { profileId: creator.profileId } });
        if (!response?.success) throw new Error(response?.error || '采集失败');
        status.textContent = '已发送到工作台';
      } catch (error) { button.disabled = false; status.textContent = String(error?.message || error); }
    });
    card.append(label, name, button, status); shadow.append(style, card); document.documentElement.append(host);
  }

  document.addEventListener('click', (event) => {
    const profile = nearestProfile(event.composedPath?.() || []);
    if (!profile) return;
    invalidate();
    const clickGeneration = generation;
    if (!window.redbookXhsBridge || typeof window.redbookXhsBridge.confirmProfileClick !== 'function') {
      window.__REDBOOK_XHS_OVERLAY_COMPANION_ERROR__ = 'bridge-unavailable';
      return;
    }
    Promise.resolve(window.redbookXhsBridge.confirmProfileClick(profile)).then((result) => {
      if (clickGeneration !== generation || result?.confirmed !== true) return;
      context = { profileId: profile.profileId, pathname: profile.pathname, nickname: result.nickname || null, confirmedAt: result.confirmedAt };
      if (timer) clearTimeout(timer);
      timer = setTimeout(invalidate, Math.max(0, TTL_MS - (Date.now() - profile.observedAt)));
      render(context);
    }).catch(() => {
      if (clickGeneration === generation) window.__REDBOOK_XHS_OVERLAY_COMPANION_ERROR__ = 'bridge-unavailable';
    });
  }, true);
  window.addEventListener('redbox:locationchange', invalidate, true);
  window.addEventListener('pagehide', invalidate, true);
  window.addEventListener('beforeunload', invalidate, true);
  window.__REDBOOK_XHS_OVERLAY_COMPANION_INSTALLED__ = true;
})();
