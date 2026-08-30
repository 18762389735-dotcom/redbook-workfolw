import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { CollectorTaskStore } from '../core/tasks/collector-task-store.mjs';

test('CollectorTaskStore writes, reloads, and cancels an active task', async () => {
  const root = await mkdtemp(join(tmpdir(), 'redbook-task-store-'));
  const filePath = join(root, 'collector-tasks.json');
  try {
    const store = new CollectorTaskStore(filePath);
    const created = await store.create('creator-baseline', 12);
    assert.equal(created.status, 'queued');
    assert.deepEqual(created.progress, { current: 0, total: 12 });
    await store.update(created.id, { status: 'running', startedAt: new Date().toISOString(), progress: { current: 2 } });
    const reloaded = new CollectorTaskStore(filePath);
    assert.equal((await reloaded.get(created.id)).status, 'running');
    const cancelled = await reloaded.cancel(created.id);
    assert.equal(cancelled.status, 'cancelled');
    assert.equal((await reloaded.cancel(created.id)), null);
    assert.match(await readFile(filePath, 'utf8'), /collector-baseline|creator-baseline/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('cancel wins a completion race and terminal tasks cannot be cancelled again', async () => {
  const root = await mkdtemp(join(tmpdir(), 'redbook-task-race-'));
  const filePath = join(root, 'collector-tasks.json');
  try {
    const store = new CollectorTaskStore(filePath);
    const created = await store.create('creator-baseline', 2);
    await store.update(created.id, { status: 'running' });
    assert.equal((await store.cancel(created.id)).status, 'cancelled');
    assert.equal((await store.update(created.id, { status: 'completed', completedAt: new Date().toISOString() })).status, 'cancelled');
    assert.equal(await store.cancel(created.id), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('completed and failed task terminal state and error survive reload', async () => {
  const root = await mkdtemp(join(tmpdir(), 'redbook-task-terminal-'));
  const filePath = join(root, 'collector-tasks.json');
  try {
    const store = new CollectorTaskStore(filePath);
    const completed = await store.create('visible-notes', 1);
    await store.update(completed.id, { status: 'completed', completedAt: new Date().toISOString() });
    const failed = await store.create('creator-profile', 1);
    await store.update(failed.id, { status: 'failed', error: '公开页面不可用', completedAt: new Date().toISOString() });
    const reloaded = new CollectorTaskStore(filePath);
    assert.equal((await reloaded.cancel(completed.id)), null);
    assert.equal((await reloaded.get(completed.id)).status, 'completed');
    assert.equal((await reloaded.get(failed.id)).error, '公开页面不可用');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('missing task store starts empty and malformed JSON fails safely', async () => {
  const root = await mkdtemp(join(tmpdir(), 'redbook-task-malformed-'));
  const filePath = join(root, 'collector-tasks.json');
  try {
    const empty = new CollectorTaskStore(filePath);
    assert.deepEqual(await empty.list(), []);
    await (await import('node:fs/promises')).writeFile(filePath, '{not-json', 'utf8');
    await assert.rejects(() => new CollectorTaskStore(filePath).list(), /JSON|Unexpected token/i);
    await (await import('node:fs/promises')).writeFile(filePath, JSON.stringify({ version: 1, tasks: [{ id: 'bad', method: 'visible-notes', status: 'invented' }] }), 'utf8');
    await assert.rejects(() => new CollectorTaskStore(filePath).list(), /status is invalid/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
