import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { AccountStore } from '../core/account/account-store.mjs';
import { createCreatorSnapshot } from '../core/creators/schema.mjs';
import { CreatorStore } from '../core/creators/creator-store.mjs';
import { OpportunityStateStore } from '../core/opportunities/opportunity-state-store.mjs';
import { createSignal } from '../core/signals/schema.mjs';
import { SignalStore } from '../core/signals/signal-store.mjs';
import { CollectorTaskStore } from '../core/tasks/collector-task-store.mjs';

test('runtime-root stores survive a clean instance restart', async () => {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'redbook-runtime-restart-'));
  try {
    const signalPath = join(runtimeRoot, 'signals.json');
    const creatorPath = join(runtimeRoot, 'creators.json');
    const opportunityPath = join(runtimeRoot, 'opportunities.json');
    const taskPath = join(runtimeRoot, 'collector-tasks.json');
    const accountPath = join(runtimeRoot, 'account.json');
    const signal = createSignal({ noteId: 'restart-note', title: 'runtime test', source: { provider: 'test', method: 'visible-notes', taskId: 'restart-task' } });
    const creator = createCreatorSnapshot({ userId: 'restart-user', name: 'runtime creator', source: { provider: 'test', method: 'creator-profile', taskId: 'restart-creator' } });

    await new SignalStore(signalPath).upsertMany([signal]);
    await new CreatorStore(creatorPath).upsertMany([creator]);
    await new OpportunityStateStore(opportunityPath).applyAction('cluster-restart', 'save', { decision_id: 'decision-restart', status: 'WATCH', limitations: [], missing_evidence: [], privacy_constraints: [], next_step: null });
    const taskStore = new CollectorTaskStore(taskPath);
    const task = await taskStore.create('visible-notes', 1);
    await taskStore.update(task.id, { status: 'completed', completedAt: new Date().toISOString() });
    const account = new AccountStore(accountPath);
    await account.update({ displayName: 'restart account' });

    const reloadedSignal = new SignalStore(signalPath);
    const reloadedCreator = new CreatorStore(creatorPath);
    const reloadedOpportunity = new OpportunityStateStore(opportunityPath);
    const reloadedTasks = new CollectorTaskStore(taskPath);
    const reloadedAccount = new AccountStore(accountPath);
    assert.equal((await reloadedSignal.get('xiaohongshu:restart-note')).noteId, 'restart-note');
    assert.equal((await reloadedCreator.get('xiaohongshu:restart-user')).userId, 'restart-user');
    assert.equal((await reloadedOpportunity.list())['cluster-restart'].state, 'saved');
    assert.equal((await reloadedTasks.get(task.id)).status, 'completed');
    assert.equal((await reloadedAccount.get()).displayName, 'restart account');
  } finally {
    await rm(runtimeRoot, { recursive: true, force: true });
  }
});
