import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('popup opens the Side Panel directly from the click gesture', async () => {
  const source = await readFile(resolve(root, 'extension/beav-redbook/src/popup.js'), 'utf8');
  const listenerStart = source.indexOf("buttons.openWorkbench.addEventListener('click', () => {");
  const listenerEnd = source.indexOf('\n  });', listenerStart);
  assert.ok(listenerStart >= 0 && listenerEnd > listenerStart);
  const listener = source.slice(listenerStart, listenerEnd);
  const openIndex = listener.indexOf('chrome.sidePanel.open({ tabId: tab.id })');

  assert.ok(openIndex >= 0, 'popup must call chrome.sidePanel.open directly');
  assert.doesNotMatch(listener, /sendMessage\(\{\s*type:\s*['"]sidepanel:open['"]/);
  assert.doesNotMatch(listener.slice(0, openIndex), /await|refreshConnectionStatus|sendMessage|storage\.get|setTimeout/);
  assert.match(listener, /Promise\.resolve\(openPromise\)[\s\S]*?window\.close\(\)/);
});

test('manifest keeps the existing Side Panel entry point', async () => {
  const manifest = JSON.parse(await readFile(resolve(root, 'extension/beav-redbook/src/manifest.json'), 'utf8'));
  assert.equal(manifest.side_panel?.default_path, 'sidepanel.html');
});
