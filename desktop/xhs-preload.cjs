/*
 * The isolated preload obtains fixed, vendored Beav sources from Electron Main
 * and injects them in the donor lifecycle order: xhsBridge/route bridge in
 * Main World, then pageObserver and the Redbook overlay companion in an
 * isolated world. The page receives only a narrow chrome.runtime shim; it
 * never receives Node or generic IPC.
 */
const { ipcRenderer, webFrame } = require('electron');
const PAGE_REQUEST_EVENT = 'redbook:beav-xhs-request';
const PAGE_RESPONSE_EVENT = 'redbook:beav-xhs-response';
const PROFILE_CLICK_EVENT = 'redbook:xhs-overlay-profile-click';
const PROFILE_CLICK_RESPONSE_EVENT = 'redbook:xhs-overlay-profile-response';
const ALLOWED_MESSAGES = new Set(['save-xhs', 'xhs:collect-current-blogger']);
ALLOWED_MESSAGES.add('redbook:xhs:collect-confirmed-creator');

function respond(id, result) {
  const detail = JSON.stringify({ id, result });
  webFrame.executeJavaScript(`window.dispatchEvent(new CustomEvent(${JSON.stringify(PAGE_RESPONSE_EVENT)}, { detail: ${JSON.stringify(detail)} }));`).catch(() => {});
}

function respondProfileClick(payload) {
  const detail = JSON.stringify(payload);
  webFrame.executeJavaScriptInIsolatedWorld(9876, [{ code: `window.dispatchEvent(new CustomEvent(${JSON.stringify(PROFILE_CLICK_RESPONSE_EVENT)}, { detail: ${JSON.stringify(detail)} }));` }]).catch(() => {});
}

window.addEventListener(PROFILE_CLICK_EVENT, async (event) => {
  let payload;
  try { payload = JSON.parse(String(event.detail || '')); } catch { return; }
  const profileId = String(payload?.profileId || '').trim();
  const pathname = String(payload?.pathname || '');
  const observedAt = Number(payload?.observedAt);
  if (!/^[A-Za-z0-9_-]+$/.test(profileId) || pathname !== `/user/profile/${profileId}` || !Number.isFinite(observedAt) || Math.abs(Date.now() - observedAt) > 10_000) return;
  try {
    const result = await ipcRenderer.invoke('desktop:beav-xhs-profile-click', { profileId, pathname, observedAt });
    respondProfileClick({ profileId, generation: Number(payload?.generation) || 0, result });
  } catch (error) {
    respondProfileClick({ profileId, generation: Number(payload?.generation) || 0, result: { confirmed: false, reason: String(error?.message || error) } });
  }
}, true);

window.addEventListener(PAGE_REQUEST_EVENT, async (event) => {
  let request;
  try { request = JSON.parse(String(event.detail || '')); } catch { return; }
  if (!request?.id || !request.message || !ALLOWED_MESSAGES.has(request.message.type)) return;
  try {
    const result = await ipcRenderer.invoke('desktop:beav-xhs-collector-action', request.message.type, request.message.payload || null);
    respond(request.id, { success: true, result });
  } catch (error) {
    respond(request.id, { success: false, error: String(error?.message || error || 'collector failed') });
  }
}, true);

try {
  const sources = ipcRenderer.sendSync('desktop:beav-xhs-sources-sync');
  if (sources?.pageShim && sources?.xhsBridge && sources?.pageRouteBridge && sources?.pageObserver && sources?.overlayCompanion) {
    const mainWorldScript = `try { eval(${JSON.stringify(sources.xhsBridge)}); eval(${JSON.stringify(sources.pageRouteBridge)}); } catch (error) { window.__REDBOOK_BEAV_PAGE_OBSERVER_ERROR__ = String(error && error.message || error); }`;
    const isolatedScript = `try { ${sources.pageShim}\n;eval(${JSON.stringify(sources.pageObserver)});\n;eval(${JSON.stringify(sources.overlayCompanion)}); } catch (error) { window.__REDBOOK_BEAV_PAGE_OBSERVER_ERROR__ = String(error && error.message || error); }`;
    const inject = () => webFrame.executeJavaScript(mainWorldScript)
      .then(() => webFrame.executeJavaScriptInIsolatedWorld(9876, [{ code: isolatedScript }]))
      .then(() => webFrame.executeJavaScript('window.__REDBOOK_BEAV_PAGE_OBSERVER_INSTALLED__ = true; window.__REDBOOK_BEAV_XHS_SHIM_INSTALLED__ = true;'))
      .catch((error) => {
        // The marker is deliberately data-only so structural smoke can report
        // an injection failure without surfacing Electron internals to XHS.
        webFrame.executeJavaScript(`window.__REDBOOK_BEAV_PAGE_OBSERVER_ERROR__ = ${JSON.stringify(String(error?.message || error))};`).catch(() => {});
      });
    // Electron 44 can stall navigation when executeJavaScriptInIsolatedWorld
    // is invoked synchronously at document_start. Queue one turn so the
    // document can establish its loading lifecycle while retaining the
    // earliest safe preload injection point.
    setTimeout(inject, 0);
  }
} catch {
  // A normal XHS page remains usable. The collector action reports the issue.
}
