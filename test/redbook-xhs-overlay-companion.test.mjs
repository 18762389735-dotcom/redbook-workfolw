import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { bindOverlayClickToState, knownStateIdentity, normalizeOverlayClick } from '../desktop/redbook-xhs-overlay-policy.cjs';
import { beavCreatorPayloadToCreatorInput } from '../vendor/beav/plugin-xhs/redbook-payload-adapter.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const companionPath = resolve(root, 'desktop/redbook-xhs-overlay-companion.js');

const state = (branch, userId, nickname = 'is涵') => ({ user: { [branch]: { userId, nickname } } });

test('explicit clicked profile A plus matching known state confirms', () => {
  const click = normalizeOverlayClick({ profileId: 'a1', pathname: '/user/profile/a1', observedAt: 1000 }, 1000);
  assert.deepEqual(bindOverlayClickToState(click, state('userInfo', 'a1'), 'confirmed'), { confirmed: true, profileId: 'a1', pathname: '/user/profile/a1', nickname: 'is涵', confirmedAt: 'confirmed' });
});

test('clicked A plus state B fails closed, and no click never confirms', () => {
  const click = normalizeOverlayClick({ profileId: 'a1', pathname: '/user/profile/a1', observedAt: 1000 }, 1000);
  assert.equal(bindOverlayClickToState(click, state('profile', 'b2')).confirmed, false);
  assert.equal(bindOverlayClickToState(null, state('userInfo', 'a1')).confirmed, false);
});

test('many links do not matter: only clicked C is represented', () => {
  const click = normalizeOverlayClick({ profileId: 'c3', pathname: '/user/profile/c3', observedAt: 1000 }, 1001);
  assert.equal(click.profileId, 'c3');
  assert.equal(bindOverlayClickToState(click, state('userPageData', 'c3')).profileId, 'c3');
});

test('expired, malformed, and token-bearing clicks are rejected or sanitized', () => {
  assert.equal(normalizeOverlayClick({ profileId: 'a1', pathname: '/user/profile/a1', observedAt: 0 }, 10_001), null);
  assert.equal(normalizeOverlayClick({ profileId: 'a1', pathname: '/user/profile/a1?xsec_token=secret', observedAt: 1000 }, 1000), null);
  const click = normalizeOverlayClick({ profileId: 'a1', pathname: '/user/profile/a1', observedAt: 1000 }, 1000);
  assert.equal(JSON.stringify(bindOverlayClickToState(click, state('userInfo', 'a1'))).includes('xsec_token'), false);
});

test('new click generation replaces prior context without nickname identity requirement', () => {
  const first = normalizeOverlayClick({ profileId: 'a1', pathname: '/user/profile/a1', observedAt: 1000, generation: 1 }, 1000);
  const second = normalizeOverlayClick({ profileId: 'b2', pathname: '/user/profile/b2', observedAt: 1100, generation: 2 }, 1100);
  assert.equal(bindOverlayClickToState(first, state('userInfo', 'a1'), new Date(1000).toISOString()).profileId, 'a1');
  assert.equal(bindOverlayClickToState(second, state('userInfo', 'b2')).profileId, 'b2');
  assert.equal(bindOverlayClickToState(second, state('userInfo', 'b2')).nickname, 'is涵');
});

test('confirmed identity can flow to the Beav creator adapter without overlay detector', () => {
  const click = normalizeOverlayClick({ profileId: 'a1', pathname: '/user/profile/a1', observedAt: 1000 }, 1000);
  const bound = bindOverlayClickToState(click, state('userInfo', 'a1'));
  const input = beavCreatorPayloadToCreatorInput({ userId: bound.profileId, nickname: bound.nickname, source: 'https://www.xiaohongshu.com/search_result_ai' }, { provider: 'beav-derived-electron-session', method: 'creator-profile', taskId: 't1', capturedAt: bound.confirmedAt });
  assert.equal(input.userId, 'a1');
  assert.equal(input.profileUrl, 'https://www.xiaohongshu.com/user/profile/a1');
});

test('companion uses shadow root, real click composedPath, and no Node globals', async () => {
  const source = await readFile(companionPath, 'utf8');
  assert.match(source, /event\.composedPath/);
  assert.match(source, /addEventListener\('click'/);
  assert.match(source, /attachShadow\(\{ mode: 'closed' \}\)/);
  assert.doesNotMatch(source, /\b(?:require|process|Buffer|child_process|ipcRenderer)\b/);
  assert.match(source, /redbook:xhs:collect-confirmed-creator/);
});
