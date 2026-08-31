import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { extractXhsBloggerPayload } from '../vendor/beav/xhs-collector/beavExtractors.js';

const require = createRequire(import.meta.url);
const { ElectronCollector } = require('../desktop/electron-collector.cjs');

function installOverlay({ stateId = '6510fac50000000012005c53', stateNickname = 'is涵', links = [], pathname = '/search_result_ai' } = {}) {
  const previous = { window: globalThis.window, document: globalThis.document, location: globalThis.location, getComputedStyle: globalThis.getComputedStyle };
  const body = { innerText: '', textContent: '', parentElement: null, isConnected: true };
  const documentElement = { innerText: '', textContent: '', parentElement: null, isConnected: true };
  const anchors = links.map(({ id = stateId, text = `${stateNickname} 小红书号：xHann03 1836 粉丝 4.2万 获赞与收藏`, visible = true, region = null } = {}) => {
    const profileRegion = region || { innerText: text, textContent: text, parentElement: body, isConnected: true };
    return {
      isConnected: visible,
      parentElement: profileRegion,
      getBoundingClientRect: () => visible ? { width: 120, height: 24 } : { width: 0, height: 0 },
      getAttribute: () => `/user/profile/${id}?xsec_token=SECRET&xsec_source=pc_search`,
    };
  });
  globalThis.location = { pathname, origin: 'https://www.xiaohongshu.com', href: `https://www.xiaohongshu.com${pathname}?xsec_token=SECRET` };
  globalThis.window = { __INITIAL_STATE__: { user: { userInfo: { userId: stateId, nickname: stateNickname, fans: '1836' } } } };
  globalThis.document = {
    title: `${stateNickname} - 小红书`, body, documentElement, scripts: [],
    querySelector: () => null,
    querySelectorAll: (selector) => selector === 'a[href]' ? anchors : [],
  };
  globalThis.getComputedStyle = () => ({ display: 'block', visibility: 'visible' });
  return () => Object.assign(globalThis, previous);
}

test('direct profile pathname stays canonical when state points to another user', () => {
  const restore = installOverlay({ pathname: '/user/profile/path-user-id', stateId: 'other-user-id', links: [] });
  try {
    const creator = extractXhsBloggerPayload();
    assert.equal(creator.userId, 'path-user-id');
    assert.equal(creator.profileUrl, 'https://www.xiaohongshu.com/user/profile/path-user-id');
  } finally { restore(); }
});

test('verified search overlay binds matching visible state identity to a canonical profile URL', () => {
  const restore = installOverlay({ links: [{}] });
  try {
    const creator = extractXhsBloggerPayload();
    assert.equal(creator.userId, '6510fac50000000012005c53');
    assert.equal(creator.nickname, 'is涵');
    assert.equal(creator.profileUrl, 'https://www.xiaohongshu.com/user/profile/6510fac50000000012005c53');
    assert.doesNotMatch(JSON.stringify(creator), /SECRET|xsec_token|xsec_source/);
  } finally { restore(); }
});

test('overlay rejects a visible profile link with a different canonical id', () => {
  const restore = installOverlay({ links: [{ id: 'another-user' }] });
  try { assert.throws(() => extractXhsBloggerPayload(), /overlay-profile-link-mismatch/); }
  finally { restore(); }
});

test('overlay rejects a local profile region with a different nickname', () => {
  const restore = installOverlay({ links: [{ text: '另一个博主 小红书号：other 1836 粉丝 4.2万 获赞与收藏' }] });
  try { assert.throws(() => extractXhsBloggerPayload(), /overlay-nickname-mismatch/); }
  finally { restore(); }
});

test('overlay rejects a local card without a profile marker', () => {
  const restore = installOverlay({ links: [{ text: 'is涵 普通搜索卡片' }] });
  try { assert.throws(() => extractXhsBloggerPayload(), /overlay-profile-marker-missing/); }
  finally { restore(); }
});

test('overlay ignores a hidden matching profile link', () => {
  const restore = installOverlay({ links: [{ visible: false }] });
  try { assert.throws(() => extractXhsBloggerPayload(), /overlay-profile-link-mismatch/); }
  finally { restore(); }
});

test('overlay fails closed when multiple distinct matching profile regions are visible', () => {
  const restore = installOverlay({ links: [{}, {}] });
  try { assert.throws(() => extractXhsBloggerPayload(), /overlay-ambiguous/); }
  finally { restore(); }
});

test('collector ingests only the extractor-verified canonical profile URL', async () => {
  const root = await mkdtemp(join(tmpdir(), 'redbook-overlay-collector-'));
  let request = null;
  const window = { isDestroyed: () => false, webContents: { isDestroyed: () => false, getURL: () => 'https://www.xiaohongshu.com/search_result_ai' } };
  const collector = new ElectronCollector({ xhsSession: { getWindow: () => window }, serverUrl: 'http://127.0.0.1:30001', runtimeRoot: root });
  collector.page = async () => ({ userId: '6510fac50000000012005c53', nickname: 'is涵', stats: {}, profileUrl: 'https://www.xiaohongshu.com/user/profile/6510fac50000000012005c53', source: 'https://www.xiaohongshu.com/search_result_ai' });
  collector.post = async (path, body) => { request = { path, body }; return { received: 1, created: 1, updated: 0, duplicates: 0 }; };
  try {
    const result = await collector.collectCreator();
    assert.equal(result.creator.userId, '6510fac50000000012005c53');
    assert.equal(result.creator.profileUrl, 'https://www.xiaohongshu.com/user/profile/6510fac50000000012005c53');
    assert.equal(request.path, '/api/creators/ingest');
    assert.equal(request.body.creators.length, 1);
    assert.equal(request.body.creators[0].profileUrl, 'https://www.xiaohongshu.com/user/profile/6510fac50000000012005c53');
  } finally { await rm(root, { recursive: true, force: true }); }
});
