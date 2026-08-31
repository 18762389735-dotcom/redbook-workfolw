import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

async function readSource(relativePath) {
  return readFile(resolve(root, relativePath), 'utf8');
}

test('XHS side panel maps note, profile, search and feed pages to Redbook actions', async () => {
  const sidepanel = await readSource('extension/beav-redbook/src/sidepanel.js');
  assert.match(sidepanel, /variant: 'xhs-search'/);
  assert.match(sidepanel, /action: 'visibleSearch'/);
  assert.match(sidepanel, /action: 'keywordSearch'/);
  assert.match(sidepanel, /type: 'xhs:collect-visible-note-links'/);
  assert.match(sidepanel, /type: 'xhs:collect-keyword'/);
  assert.match(sidepanel, /variant: 'xhs-feed'/);
  assert.match(sidepanel, /action: 'visibleFeed'/);
  assert.match(sidepanel, /variant: 'xhs-unavailable'/);
  assert.match(sidepanel, /当前页面暂无可执行的小红书采集操作/);

  const xhsBranch = sidepanel.slice(sidepanel.indexOf("if (platform === 'xhs') {"));
  assert.doesNotMatch(xhsBranch.slice(0, xhsBranch.indexOf("if (platform === 'youtube')")), /action: 'savePageLink'/);
});

test('XHS URL detection identifies search and feed surfaces without a DOM scraper', async () => {
  const [background, observer] = await Promise.all([
    readSource('extension/beav-redbook/src/background.js'),
    readSource('extension/beav-redbook/src/pageObserver.js'),
  ]);
  for (const source of [background, observer]) {
    assert.match(source, /search_result\(\?:_ai\)\?/);
    assert.match(source, /kind: 'xhs-search'/);
    assert.match(source, /pageType: 'xhs-search'/);
    assert.match(source, /kind: 'xhs-feed'/);
    assert.match(source, /pageType: 'xhs-feed'/);
    assert.match(source, /xhs:collect-visible-note-links/);
  }
});

test('XHS side panel health does not depend on Native Host status', async () => {
  const [background, sidepanel] = await Promise.all([
    readSource('extension/beav-redbook/src/background.js'),
    readSource('extension/beav-redbook/src/sidepanel.js'),
  ]);
  assert.match(background, /const isXhsTab = isXhsPageUrl\(tab\?\.url\)/);
  assert.match(background, /state: 'not-required'/);
  assert.match(sidepanel, /if \(isXhsContext\(nextContext\)\)/);
  assert.match(sidepanel, /工作台已连接/);
  assert.doesNotMatch(sidepanel, /XHS.*Native Host/);
});

test('search actions pass existing queue-compatible options', async () => {
  const sidepanel = await readSource('extension/beav-redbook/src/sidepanel.js');
  assert.match(sidepanel, /message\.options = \{[\s\S]*taskType: 'visible-search'/);
  assert.match(sidepanel, /message\.options = \{ method: 'visible-notes', limit: searchOptions\.limit, taskType: 'keyword' \}/);
  assert.match(sidepanel, /xhsKeywordNoteLimit: 20/);

  const background = await readSource('extension/beav-redbook/src/background.js');
  assert.match(background, /const method = normalizeText\(options\?\.method\) \|\| \(normalizeText\(options\?\.taskType\) === 'blogger-notes' \? 'creator-baseline' : 'visible-notes'\)/);
  assert.match(background, /method: normalizeText\(options\?\.method\) \|\| 'visible-notes'/);
});
