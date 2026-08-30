import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { AccountStore } from '../core/account/account-store.mjs';

const folders = [];
afterEach(async () => Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true }))));
async function createStore() { const folder = await mkdtemp(join(tmpdir(), 'account-store-')); folders.push(folder); return { folder, store: new AccountStore(join(folder, 'custom-account.json')) }; }

test('default Account Profile is empty', async () => {
  const { store } = await createStore(); const profile = await store.get();
  assert.equal(profile.displayName, ''); assert.deepEqual(profile.contentPillars, []); assert.equal(profile.currentContext.recentlyDoing, ''); assert.deepEqual(profile.fieldSources, {});
});

test('update and reload preserve Account Profile', async () => {
  const { folder, store } = await createStore(); await store.update({ displayName: '测试账号', positioning: '设计实践' }, '2026-08-30T01:00:00.000Z');
  const reloaded = await new AccountStore(join(folder, 'custom-account.json')).get(); assert.equal(reloaded.displayName, '测试账号'); assert.equal(reloaded.positioning, '设计实践');
});

test('array and string fields are sanitized deterministically', async () => {
  const { store } = await createStore(); const profile = await store.update({ contentPillars: [' AI工具 ', '', 'AI工具'], strengths: '研究\n 表达 \n研究', currentContext: { currentTools: 'Figma\n\nCodex' } });
  assert.deepEqual(profile.contentPillars, ['AI工具']); assert.deepEqual(profile.strengths, ['研究', '表达']); assert.deepEqual(profile.currentContext.currentTools, ['Figma', 'Codex']);
});

test('saved fields are marked user_confirmed', async () => {
  const { store } = await createStore(); const profile = await store.update({ niche: '设计' });
  assert.equal(profile.fieldSources.niche, 'user_confirmed'); assert.equal(profile.fieldSources['currentContext.currentGoals'], 'user_confirmed');
});

test('Account Store uses the injected path', async () => {
  const { folder, store } = await createStore(); assert.equal(store.filePath, join(folder, 'custom-account.json')); await store.update({ niche: '测试' });
  const second = new AccountStore(join(folder, 'other.json')); assert.equal((await second.get()).niche, '');
});
