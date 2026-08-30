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
