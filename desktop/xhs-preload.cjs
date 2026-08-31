/*
 * XHS preload boundary.
 *
 * Beav's page observer and the Redbook overlay companion execute in isolated
 * world 9876. Only the three typed operations below cross into Electron Main;
 * no ipcRenderer, generic invoke, or Node capability is exposed to the page.
 */
const { contextBridge, ipcRenderer, webFrame } = require('electron');

const ALLOWED_MESSAGES = new Set(['save-xhs', 'xhs:collect-current-blogger', 'redbook:xhs:collect-confirmed-creator']);

function sanitizeProfileClick(payload) {
  const profileId = String(payload?.profileId || '').trim();
  const pathname = String(payload?.pathname || '');
  const observedAt = Number(payload?.observedAt);
  if (!/^[A-Za-z0-9_-]+$/.test(profileId)) return null;
  if (pathname !== `/user/profile/${profileId}`) return null;
  if (!Number.isFinite(observedAt) || Math.abs(Date.now() - observedAt) > 10_000) return null;
  return { profileId, pathname, observedAt };
}

function errorMessage(error, fallback) {
  return String(error?.message || error || fallback);
}

const isolatedBridge = Object.freeze({
  ping() {
    return { bridge: 'redbook-xhs', version: 1 };
  },

  sendCollectorMessage(message) {
    const type = message && typeof message === 'object' ? String(message.type || '') : '';
    if (!ALLOWED_MESSAGES.has(type)) return Promise.reject(new Error('unsupported-beav-xhs-message'));
    const payload = message && typeof message === 'object' ? message.payload || null : null;
    return ipcRenderer.invoke('desktop:beav-xhs-collector-action', type, payload)
      .then((result) => ({ success: true, result }))
      .catch((error) => ({ success: false, error: errorMessage(error, 'collector failed') }));
  },

  confirmProfileClick(payload) {
    const sanitized = sanitizeProfileClick(payload);
    if (!sanitized) return Promise.resolve({ confirmed: false, reason: 'invalid-profile-click' });
    return ipcRenderer.invoke('desktop:beav-xhs-profile-click', sanitized)
      .then((result) => result || { confirmed: false, reason: 'empty-profile-confirmation' })
      .catch((error) => ({ confirmed: false, reason: errorMessage(error, 'profile confirmation failed') }));
  },
});

// Electron 44 supports this API. Keeping the bridge in world 9876 preserves
// the donor page observer's isolated-world lifecycle without exposing it to
// the XHS Main World.
contextBridge.exposeInIsolatedWorld(9876, 'redbookXhsBridge', isolatedBridge);

try {
  const sources = ipcRenderer.sendSync('desktop:beav-xhs-sources-sync');
  if (sources?.pageShim && sources?.xhsBridge && sources?.pageRouteBridge && sources?.pageObserver && sources?.overlayCompanion) {
    const mainWorldScript = `try { eval(${JSON.stringify(sources.xhsBridge)}); eval(${JSON.stringify(sources.pageRouteBridge)}); } catch (error) { window.__REDBOOK_BEAV_PAGE_OBSERVER_ERROR__ = String(error && error.message || error); }`;
    const isolatedScript = `try { ${sources.pageShim}\n;eval(${JSON.stringify(sources.pageObserver)});\n;eval(${JSON.stringify(sources.overlayCompanion)}); } catch (error) { window.__REDBOOK_BEAV_PAGE_OBSERVER_ERROR__ = String(error && error.message || error); }`;
    const inject = () => webFrame.executeJavaScript(mainWorldScript)
      .then(() => webFrame.executeJavaScriptInIsolatedWorld(9876, [{ code: isolatedScript }]))
      .then(() => webFrame.executeJavaScriptInIsolatedWorld(9876, [{ code: 'window.__REDBOOK_BEAV_PAGE_OBSERVER_INSTALLED__ = true; window.__REDBOOK_BEAV_XHS_SHIM_INSTALLED__ = true;' }]))
      .catch((error) => {
        // The marker is deliberately data-only so structural smoke can report
        // an injection failure without surfacing Electron internals to XHS.
        webFrame.executeJavaScriptInIsolatedWorld(9876, [{ code: `window.__REDBOOK_BEAV_PAGE_OBSERVER_ERROR__ = ${JSON.stringify(String(error?.message || error))};` }]).catch(() => {});
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
