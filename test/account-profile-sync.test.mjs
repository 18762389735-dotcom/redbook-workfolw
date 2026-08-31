import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { AccountStore } from '../core/account/account-store.mjs';
import { createSignal } from '../core/signals/schema.mjs';
import { SignalStore } from '../core/signals/signal-store.mjs';
import { createAccountApiHandler } from '../server/account-api.mjs';
import { createBeavConnector } from '../server/beav-connector.mjs';
import { beavCreatorPayloadToAccountFacts } from '../vendor/beav/plugin-xhs/redbook-payload-adapter.js';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const cleanups = [];
afterEach(async () => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

async function fixture() {
  const folder = await mkdtemp(join(tmpdir(), 'account-profile-sync-'));
  const accountStore = new AccountStore(join(folder, 'account.json'));
  const signalStore = new SignalStore(join(folder, 'signals.json'));
  await signalStore.upsertMany([
    createSignal({ noteId: 'own-1', title: '设计学习效率工具', bodyText: '工具使用经验', author: { id: '5fbf43fa00000000100af2a' }, metrics: { likes: 12 }, source: { provider: 'test', method: 'current-note', taskId: 't1' } }),
    createSignal({ noteId: 'other-1', title: '无关内容', author: { id: 'other-456' }, source: { provider: 'test', method: 'current-note', taskId: 't2' } }),
  ]);
  const handler = createAccountApiHandler(accountStore, { signalStore });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  cleanups.push(async () => { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); await rm(folder, { recursive: true, force: true }); });
  return { baseUrl, accountStore };
}

test('XHS account sync stores separated public facts and analyzes only own saved notes', async () => {
  const { baseUrl } = await fixture();
  const response = await fetch(`${baseUrl}/api/account/xhs-sync`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facts: { userId: '5fbf43fa00000000100af2a', accountName: '努力上岸的南瓜🎃', xhsId: '1045421577', bio: '设计学研1', followers: 1118, following: 113, likesAndCollects: 4943, school: '浙江理工大学', publicTags: ['学习'], profileUrl: 'https://www.xiaohongshu.com/user/profile/own-123' } }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.facts.followers, 1118);
  assert.equal(body.facts.likesAndCollects, 4943);
  assert.equal(body.facts.source, 'xhs_profile');
  assert.equal(body.facts.type, 'fact');
  assert.equal(body.profile.recentContent.count, 1);
  assert.equal(body.profile.profileAnalysis.source, 'ai_profile_analysis');
  assert.equal(body.profile.profileAnalysis.type, 'inferred');
  assert.equal(body.profile.fieldSources.positioning, 'ai_profile_analysis');
});

test('canonical userId and public xhsId stay separate and own signals join by canonical id', async () => {
  const { baseUrl } = await fixture();
  const facts = {
    userId: '5fbf43fa00000000100af2a',
    xhsId: '1045421577',
    accountName: '努力上岸的南瓜🎃',
    followers: 1115,
    following: 113,
    likesAndCollects: 4959,
    profileUrl: 'https://www.xiaohongshu.com/user/profile/should-be-canonical',
  };
  const response = await fetch(`${baseUrl}/api/account/xhs-sync`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facts }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.profile.userId, facts.userId);
  assert.equal(body.facts.userId, facts.userId);
  assert.equal(body.facts.xhsId, facts.xhsId);
  assert.equal(body.facts.followers, 1115);
  assert.equal(body.facts.following, 113);
  assert.equal(body.facts.likesAndCollects, 4959);
  assert.equal(body.facts.profileUrl, `https://www.xiaohongshu.com/user/profile/${facts.userId}`);
  assert.equal(body.profile.recentContent.count, 1);
});

test('profile mapping accepts canonical and public ids without metric swaps', () => {
  const facts = beavCreatorPayloadToAccountFacts({
    userId: '5fbf43fa00000000100af2a',
    xhsId: '1045421577',
    nickname: '努力上岸的南瓜🎃',
    stats: { fans: 1115, follows: 113, liked: 4959 },
    source: 'https://www.xiaohongshu.com/user/profile/5fbf43fa00000000100af2a',
  }, { capturedAt: '2026-08-31T00:00:00.000Z' });
  assert.deepEqual({ userId: facts.userId, xhsId: facts.xhsId, followers: facts.followers, following: facts.following, likesAndCollects: facts.likesAndCollects }, {
    userId: '5fbf43fa00000000100af2a', xhsId: '1045421577', followers: 1115, following: 113, likesAndCollects: 4959,
  });
});

test('resyncing one canonical user updates the single account profile', async () => {
  const { baseUrl, accountStore } = await fixture();
  const facts = { userId: '5fbf43fa00000000100af2a', xhsId: '1045421577', accountName: '账号', followers: 1115, following: 113, likesAndCollects: 4959 };
  await fetch(`${baseUrl}/api/account/xhs-sync`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facts }) });
  await fetch(`${baseUrl}/api/account/xhs-sync`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facts: { ...facts, followers: 1116 } }) });
  const profile = await accountStore.get();
  assert.equal(profile.userId, facts.userId);
  assert.equal(profile.facts.xhsId, facts.xhsId);
  assert.equal(profile.facts.followers, 1116);
});

test('XHS resync preserves confirmed profile fields while refreshing facts', async () => {
  const { baseUrl } = await fixture();
  const facts = { userId: '5fbf43fa00000000100af2a', accountName: '账号', xhsId: '1045421577', followers: 100, likesAndCollects: 200, profileUrl: 'https://www.xiaohongshu.com/user/profile/own-123' };
  await fetch(`${baseUrl}/api/account/xhs-sync`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facts }) });
  const confirmed = await (await fetch(`${baseUrl}/api/account`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ positioning: '我确认的定位' }) })).json();
  assert.equal(confirmed.fieldSources.positioning, 'user_confirmed');
  const refreshed = await (await fetch(`${baseUrl}/api/account/xhs-sync`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facts: { ...facts, followers: 1118, likesAndCollects: 4943 } }) })).json();
  assert.equal(refreshed.facts.followers, 1118);
  assert.equal(refreshed.facts.likesAndCollects, 4943);
  assert.equal(refreshed.profile.positioning, '我确认的定位');
  assert.equal(refreshed.profile.fieldSources.positioning, 'user_confirmed');
});

test('connector account route maps donor creator payload without changing creator identity', async () => {
  let received;
  const connector = createBeavConnector({
    ingestSignals: async () => ({}),
    ingestCreators: async () => ({}),
    ingestAccount: async (payload) => { received = payload; return { success: true, profile: { facts: payload.facts } }; },
    port: 0,
  });
  const result = await connector.ingestAccountProfile({ userId: 'own-123', nickname: '账号', description: '简介', stats: { fans: '1,118', follows: '113', liked: '4,943' }, source: 'https://www.xiaohongshu.com/user/profile/own-123?xsec_token=omit' });
  assert.equal(result.userId, 'own-123');
  assert.equal(received.facts.followers, '1,118');
  assert.equal(received.facts.likesAndCollects, '4,943');
  assert.equal(received.facts.profileUrl, 'https://www.xiaohongshu.com/user/profile/own-123');
});

test('account sync uses the existing XHS blogger extractor action in both UI adapters', async () => {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const background = await readFile(join(root, 'extension', 'beav-redbook', 'src', 'background.js'), 'utf8');
  const sidepanel = await readFile(join(root, 'extension', 'beav-redbook', 'src', 'sidepanel.js'), 'utf8');
  assert.match(background, /case 'account:sync-xhs-profile'/);
  assert.match(background, /runExtraction\(tabId, extractXhsBloggerPayload/);
  assert.match(background, /forwardToRedbook\('account'/);
  assert.match(sidepanel, /action: 'syncAccount'/);
  assert.match(sidepanel, /type: 'account:sync-xhs-profile'/);
});
