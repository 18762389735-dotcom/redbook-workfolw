import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SignalStore } from '../core/signals/signal-store.mjs';
import { ingestSignals } from '../core/signals/ingest-signals.mjs';
const folders = []; afterEach(async () => Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true }))));
async function store() { const folder = await mkdtemp(join(tmpdir(), 'signal-store-')); folders.push(folder); return new SignalStore(join(folder, 'signals.json')); }
const raw = { note_id: 'note-1', title: '真实响应字段示例', user: { user_id: 'u-1', nickname: '作者' }, liked_count: 12, source: { provider: 'manual-test', method: 'visible-notes', taskId: 'task-1', capturedAt: '2026-08-30T00:00:00.000Z' } };
test('ingest normalizes and deduplicates by noteId', async () => { const target = await store(); const first = await ingestSignals(target, { signals: [raw] }); assert.deepEqual(first, { received: 1, created: 1, updated: 0, duplicates: 0 }); const second = await ingestSignals(target, { signals: [{ ...raw, source: { ...raw.source, capturedAt: '2026-08-30T01:00:00.000Z' } }] }); assert.equal(second.duplicates, 1); const records = await target.list(); assert.equal(records.length, 1); assert.equal(records[0].metrics.likes, 12); assert.equal(records[0].author.followerCount, null); });
test('upsert updates changed platform facts and survives reload', async () => { const target = await store(); await ingestSignals(target, { signals: [raw] }); const result = await ingestSignals(target, { signals: [{ ...raw, liked_count: 13 }] }); assert.equal(result.updated, 1); const reload = new SignalStore(target.filePath); assert.equal((await reload.list())[0].metrics.likes, 13); assert.equal(await reload.delete('xiaohongshu:note-1'), true); assert.equal((await reload.list()).length, 0); });
test('preserves only a collector-provided source URL', async () => { const target = await store(); await ingestSignals(target, { signals: [{ ...raw, url: 'https://www.xiaohongshu.com/explore/note-1?xsec_token=provided-by-page' }] }); assert.equal((await target.list())[0].url, 'https://www.xiaohongshu.com/explore/note-1?xsec_token=provided-by-page'); });
test('invalid signals fail rather than invent platform data', async () => { const target = await store(); await assert.rejects(() => ingestSignals(target, { signals: [{ title: 'missing note id', source: { provider: 'test', method: 'manual' } }] }), /noteId/); });
