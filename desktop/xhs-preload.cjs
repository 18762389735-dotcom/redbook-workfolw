/*
 * The isolated preload obtains fixed, vendored Beav sources from Electron Main
 * and injects them into XHS's main world in the donor lifecycle order:
 * xhsBridge, route bridge, then pageObserver. The page receives only a narrow
 * chrome.runtime compatibility shim; it never receives Node or generic IPC.
 */
const { ipcRenderer, webFrame } = require('electron');
const PAGE_REQUEST_EVENT = 'redbook:beav-xhs-request';
const PAGE_RESPONSE_EVENT = 'redbook:beav-xhs-response';
const ALLOWED_MESSAGES = new Set(['save-xhs', 'xhs:collect-current-blogger']);

function respond(id, result) {
  const detail = JSON.stringify({ id, result });
  webFrame.executeJavaScript(`window.dispatchEvent(new CustomEvent(${JSON.stringify(PAGE_RESPONSE_EVENT)}, { detail: ${JSON.stringify(detail)} }));`).catch(() => {});
}

window.addEventListener(PAGE_REQUEST_EVENT, async (event) => {
  let request;
  try { request = JSON.parse(String(event.detail || '')); } catch { return; }
  if (!request?.id || !request.message || !ALLOWED_MESSAGES.has(request.message.type)) return;
  try {
    const result = await ipcRenderer.invoke('desktop:beav-xhs-collector-action', request.message.type);
    respond(request.id, { success: true, result });
  } catch (error) {
    respond(request.id, { success: false, error: String(error?.message || error || 'collector failed') });
  }
}, true);

try {
  const sources = ipcRenderer.sendSync('desktop:beav-xhs-sources-sync');
  if (sources?.pageShim && sources?.xhsBridge && sources?.pageRouteBridge && sources?.pageObserver) {
    const script = `try { ${sources.pageShim}\n;eval(${JSON.stringify(sources.xhsBridge)});\n;eval(${JSON.stringify(sources.pageRouteBridge)});\n;eval(${JSON.stringify(sources.pageObserver)});\nwindow.__REDBOOK_BEAV_PAGE_OBSERVER_INSTALLED__ = true; } catch (error) { window.__REDBOOK_BEAV_PAGE_OBSERVER_ERROR__ = String(error && error.message || error); }`;
    webFrame.executeJavaScript(script).catch((error) => {
      // The marker is deliberately data-only so structural smoke can report
      // an injection failure without surfacing Electron internals to XHS.
      webFrame.executeJavaScript(`window.__REDBOOK_BEAV_PAGE_OBSERVER_ERROR__ = ${JSON.stringify(String(error?.message || error))};`).catch(() => {});
    });
  }
} catch {
  // A normal XHS page remains usable. The collector action reports the issue.
}
