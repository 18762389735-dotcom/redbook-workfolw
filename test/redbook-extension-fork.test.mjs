import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const extensionRoot = resolve(root, 'extension', 'beav-redbook', 'src');

async function source(name) {
  return readFile(resolve(extensionRoot, name), 'utf8');
}

test('native browser fork keeps the complete donor runtime entry points', async () => {
  const manifest = JSON.parse(await source('manifest.json'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.service_worker, 'background.js');
  assert.deepEqual(manifest.content_scripts.map((item) => item.js), [
    ['vendor/md5.min.js', 'xhsBridge.js'],
    ['pageObserver.js'],
  ]);
  for (const required of ['sidepanel.html', 'sidepanel.js', 'sidepanel.css', 'popup.html', 'popup.js', 'background.js', 'captureRuntime.js', 'pageRouteBridge.js', 'xhsBridge.js']) {
    assert.ok((await source(required)).length > 0, required);
  }
});

test('Redbook fork uses the loopback connector as the formal XHS sink', async () => {
  const [background, popup, sidepanel, settings] = await Promise.all([
    source('background.js'),
    source('popup.js'),
    source('sidepanel.js'),
    source('settings.js'),
  ]);
  assert.match(background, /const REDBOOK_FORMAL_MODE = true/);
  assert.match(background, /REDBOOK_CONNECTOR_UNAVAILABLE/);
  assert.match(background, /forwardToRedbook\('note'/);
  assert.match(background, /forwardToRedbook\('creator'/);
  assert.match(sidepanel, /action: 'saveBlogger'/);
  assert.match(sidepanel, /if \(!REDBOOK_FORMAL_MODE\) await refreshUpdateStatus/);
  assert.match(popup, /if \(!REDBOOK_FORMAL_MODE\) await refreshUpdateStatus/);
  assert.match(settings, /autoUpdateCheck: false/);
});

test('fork branding keeps platform-facing actions on the workbench boundary', async () => {
  const [manifest, popup, sidepanel, observer] = await Promise.all([
    source('manifest.json'),
    source('popup.html'),
    source('sidepanel.html'),
    source('pageObserver.js'),
  ]);
  assert.match(manifest, /小红书采集助手/);
  assert.match(popup, /保存到工作台/);
  assert.match(sidepanel, /小红书采集助手/);
  assert.match(observer, /保存小红书图文到工作台/);
  assert.match(observer, /保存当前小红书博主资料到工作台/);
  assert.doesNotMatch(observer, /保存小红书图文到知识库/);
});

test('workbench keeps the Electron collector explicitly experimental in production UI', async () => {
  const sourceText = await readFile(resolve(root, 'apps', 'web', 'src', 'pages', 'DiscoverPage.jsx'), 'utf8');
  assert.match(sourceText, /const desktopCollectorEnabled = import\.meta\.env\.DEV === true/);
  assert.match(sourceText, /实验性桌面小红书采集/);
  assert.match(sourceText, /正式采集路径请使用浏览器中的小红书采集助手/);
});
