// Derived adapter for Jamailar/Beav Plugin/src/pageObserver.js and its
// background message names (background.js SHA256:
// 0D5EA8786A0F86F79F3B78B03C4BDD7635FF8A69C3B413BE37FE178418F27DE4).
// License: MIT License - Non-Commercial Use Only. This is not a
// general Chrome extension API and deliberately exposes no Node capability.
const PAGE_REQUEST_EVENT = 'redbook:beav-xhs-request';
const PAGE_RESPONSE_EVENT = 'redbook:beav-xhs-response';

const COLLECTOR_MESSAGE_TYPES = Object.freeze([
  'save-xhs',
  'xhs:collect-current-blogger',
  'redbook:xhs:collect-confirmed-creator',
]);

function allowedCollectorMessage(message) {
  return Boolean(message && typeof message === 'object' && COLLECTOR_MESSAGE_TYPES.includes(message.type));
}

function pageShimSource() {
  return `(() => {
    if (window.__REDBOOK_BEAV_XHS_SHIM_INSTALLED__) return;
    window.__REDBOOK_BEAV_XHS_SHIM_INSTALLED__ = true;
    const requestEvent = ${JSON.stringify(PAGE_REQUEST_EVENT)};
    const responseEvent = ${JSON.stringify(PAGE_RESPONSE_EVENT)};
    const allow = new Set(${JSON.stringify(COLLECTOR_MESSAGE_TYPES)});
    let nextId = 0;
    const listeners = new Set();
    function sendMessage(message) {
      const type = message && typeof message === 'object' ? message.type : '';
      if (type === 'page-state:update') return Promise.resolve({ success: true });
      if (type === 'capture:platform-save-safety-notice:get') return Promise.resolve({ success: true, required: false });
      if (!allow.has(type)) return Promise.resolve({ success: false, error: 'unsupported-beav-xhs-message' });
      const id = String(++nextId);
      return new Promise((resolve) => {
        const timer = setTimeout(() => { cleanup(); resolve({ success: false, error: 'collector-response-timeout' }); }, 30000);
        const onResponse = (event) => {
          let payload;
          try { payload = JSON.parse(String(event.detail || '')); } catch { return; }
          if (!payload || payload.id !== id) return;
          cleanup();
          resolve(payload.result || { success: false, error: 'collector-empty-response' });
        };
        const cleanup = () => { clearTimeout(timer); window.removeEventListener(responseEvent, onResponse, true); };
        window.addEventListener(responseEvent, onResponse, true);
        window.dispatchEvent(new CustomEvent(requestEvent, { detail: JSON.stringify({ id, message }) }));
      });
    }
    const runtime = {
      sendMessage,
      getURL(asset) { return asset === 'pageRouteBridge.js' ? 'about:blank' : ''; },
      onMessage: { addListener(listener) { if (typeof listener === 'function') listeners.add(listener); } },
    };
    window.chrome = Object.assign({}, window.chrome || {}, { runtime });
  })();`;
}

module.exports = { PAGE_REQUEST_EVENT, PAGE_RESPONSE_EVENT, COLLECTOR_MESSAGE_TYPES, allowedCollectorMessage, pageShimSource };
