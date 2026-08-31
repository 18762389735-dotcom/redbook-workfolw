import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { inspectXhsPublicProfileEvidence } from '../vendor/beav/xhs-collector/beavExtractors.js';

const require = createRequire(import.meta.url);
const { ElectronCollector } = require('../desktop/electron-collector.cjs');

function installPage({ pathname = '/explore/a-note', text = '', title = '小红书', profile = null, links = [] } = {}) {
  const previous = { window: globalThis.window, document: globalThis.document, location: globalThis.location };
  globalThis.location = { pathname, origin: 'https://www.xiaohongshu.com', href: `https://www.xiaohongshu.com${pathname}` };
  globalThis.window = { __INITIAL_STATE__: profile ? { user: { userPageData: profile } } : undefined };
  const root = { innerText: text, textContent: text };
  globalThis.document = {
    title,
    body: root,
    scripts: [],
    querySelector: () => null,
    querySelectorAll: (selector) => selector === 'a[href]' ? links.map((href) => ({ getAttribute: () => href })) : [],
  };
  return () => Object.assign(globalThis, previous);
}

test('profile evidence reads a traditional profile pathname without query data', () => {
  const restore = installPage({ pathname: '/user/profile/internal-id?xsec_token=SECRET' });
  try {
    const evidence = inspectXhsPublicProfileEvidence();
    assert.equal(evidence.profilePathId, 'internal-id');
    assert.equal(evidence.pathname, '/user/profile/internal-id');
    assert.doesNotMatch(JSON.stringify(evidence), /SECRET/);
  } finally { restore(); }
});

test('public handle and visible metrics are evidence but never a canonical state identity', () => {
  const restore = installPage({ text: 'is涵 小红书号：xHann03 942 关注 1836 粉丝 4.2万 获赞与收藏' });
  try {
    const evidence = inspectXhsPublicProfileEvidence();
    assert.equal(evidence.publicHandle, 'xHann03');
    assert.equal(evidence.stateIdentity.userId, null);
    assert.equal(evidence.evidence.hasProfileMetrics, true);
    assert.equal(evidence.evidence.hasStateUserId, false);
  } finally { restore(); }
});

test('observed profile links retain only pathname and profile id', () => {
  const restore = installPage({ links: ['/user/profile/internal-id?xsec_token=SECRET', 'https://www.xiaohongshu.com/user/profile/internal-id?token=SECRET'] });
  try {
    const evidence = inspectXhsPublicProfileEvidence();
    assert.deepEqual(evidence.observedProfileLinks, [{ pathname: '/user/profile/internal-id', profileId: 'internal-id' }]);
    assert.doesNotMatch(JSON.stringify(evidence), /SECRET/);
  } finally { restore(); }
});

test('known state identity branches expose only a canonical candidate', () => {
  const restore = installPage({ profile: { basic_info: { user_id: 'state-user-id' } } });
  try {
    const evidence = inspectXhsPublicProfileEvidence();
    assert.deepEqual(evidence.stateIdentity, { branch: 'user.userPageData', userId: 'state-user-id' });
  } finally { restore(); }
});

test('ordinary note text mentioning fans does not create profile identity evidence', () => {
  const restore = installPage({ text: '这篇笔记讨论粉丝如何增长' });
  try {
    const evidence = inspectXhsPublicProfileEvidence();
    assert.equal(evidence.stateIdentity.userId, null);
    assert.equal(evidence.evidence.hasPublicHandle, false);
    assert.equal(evidence.evidence.hasObservedProfileLink, false);
    assert.equal(evidence.evidence.hasStateUserId, false);
  } finally { restore(); }
});

test('creator recognition failure attaches evidence but does not write a Creator', async () => {
  const root = await mkdtemp(join(tmpdir(), 'redbook-profile-evidence-'));
  let postCalls = 0;
  const window = { isDestroyed: () => false, webContents: { isDestroyed: () => false, getURL: () => 'https://www.xiaohongshu.com/explore/profile-view' } };
  const collector = new ElectronCollector({ xhsSession: { getWindow: () => window }, serverUrl: 'http://127.0.0.1:30001', runtimeRoot: root });
  collector.page = async (_target, _fn, _args, label) => {
    if (label === 'creator-profile') {
      const error = new Error('Page script failed [creator-profile/page-function]: Error: 当前页面未识别到可验证的博主公开资料');
      error.stage = 'page-function';
      throw error;
    }
    if (label === 'creator-evidence') return { pathname: '/explore/profile-view', profilePathId: null, observedProfileLinks: [], stateIdentity: { branch: null, userId: null }, publicHandle: 'xHann03', evidence: { hasProfileMetrics: true } };
    throw new Error(`unexpected label ${label}`);
  };
  collector.post = async () => { postCalls += 1; };
  try {
    await assert.rejects(() => collector.collectCreator(), /Profile evidence:.*publicHandle=xHann03/);
    const [task] = await collector.listTasks();
    assert.equal(task.status, 'failed');
    assert.match(task.error, /Profile evidence:/);
    assert.equal(postCalls, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});
