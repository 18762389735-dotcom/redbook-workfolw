import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractXhsBloggerNotesPayload, extractXhsBloggerPayload } from '../vendor/beav/xhs-collector/beavExtractors.js';

function installPage({ pathname = '/explore/observed-note', profile = null, pageText = '' } = {}) {
  const previous = { window: globalThis.window, document: globalThis.document, location: globalThis.location };
  const root = { innerText: pageText, textContent: pageText };
  globalThis.location = { pathname, href: `https://www.xiaohongshu.com${pathname}`, origin: 'https://www.xiaohongshu.com' };
  globalThis.window = { __INITIAL_STATE__: profile ? { user: { userPageData: profile } } : undefined, __REDBOX_XHS_RESPONSES__: [], scrollTo: () => {} };
  globalThis.document = {
    title: 'is涵 - 小红书',
    body: root,
    documentElement: { scrollHeight: 0 },
    scripts: [],
    querySelector: (selector) => /user-page|user-info|profile/.test(selector) ? root : null,
    querySelectorAll: () => [],
  };
  return () => Object.assign(globalThis, previous);
}

test('observed public profile state can be collected when XHS renders it over a non-profile URL', async () => {
  const restore = installPage({ profile: { userId: 'creator-internal-id', nickname: 'is涵', fans: '1836' }, pageText: '942 关注 1836 粉丝 4.2万 获赞与收藏' });
  try {
    const creator = extractXhsBloggerPayload();
    assert.equal(creator.userId, 'creator-internal-id');
    assert.equal(creator.nickname, 'is涵');
    assert.equal(creator.source, 'https://www.xiaohongshu.com/explore/observed-note');
    const baseline = await extractXhsBloggerNotesPayload(12, 'rpa');
    assert.equal(baseline.userId, 'creator-internal-id');
    assert.deepEqual(baseline.notes, []);
  } finally { restore(); }
});

test('ordinary note pages without profile identity remain rejected', () => {
  const restore = installPage({ pageText: '这是一篇普通笔记' });
  try { assert.throws(() => extractXhsBloggerPayload(), /未识别到可验证的博主公开资料/); }
  finally { restore(); }
});
