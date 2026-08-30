/* Inject the single attributed xhsBridge source into the page main world. */
const { ipcRenderer, webFrame } = require('electron');

try {
  const source = ipcRenderer.sendSync('desktop:xhs-bridge-source-sync');
  if (source) {
    // executeJavaScript runs in the page main world; the source itself remains
    // the exact vendor/beav/xhs-collector/xhsBridge.js file.
    webFrame.executeJavaScript(`eval(${JSON.stringify(source)})`).catch(() => {});
  }
} catch {
  // The page remains usable when the bridge is unavailable; collection reports
  // the missing observed responses instead of inventing data.
}
