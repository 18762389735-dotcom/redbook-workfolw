import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export class OpportunityStateStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.states = {};
    this.loaded = false;
    this.pendingWrite = Promise.resolve();
  }

  async load() {
    if (this.loaded) return;
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8'));
      this.states = parsed.states || {};
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    this.loaded = true;
  }

  async list() {
    await this.load();
    return structuredClone(this.states);
  }

  async applyAction(clusterId, action, decision, now = new Date().toISOString()) {
    await this.load();
    if (!['save', 'dismiss', 'select', 'reopen'].includes(action)) throw new TypeError('不支持的机会操作');
    const previous = this.states[clusterId] || { state: 'active' };
    const next = { ...previous };
    if (action === 'save') Object.assign(next, { state: 'saved', savedAt: now });
    if (action === 'dismiss') Object.assign(next, { state: 'dismissed', dismissedAt: now });
    if (action === 'reopen') Object.assign(next, { state: 'active', reopenedAt: now, selectedDecisionSnapshot: null });
    if (action === 'select') Object.assign(next, {
      state: 'selected',
      selectedAt: now,
      selectedDecisionSnapshot: {
        decisionId: decision.decision_id,
        decisionStatus: decision.status,
        manualOverride: decision.status !== 'QUALIFIED',
        limitations: [...(decision.limitations || [])],
        missingEvidence: [...(decision.missing_evidence || [])],
        privacyConstraints: [...(decision.privacy_constraints || [])],
        nextStep: decision.next_step,
      },
    });
    this.states[clusterId] = next;
    await this.persist();
    return structuredClone(next);
  }

  async persist() {
    const save = async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.tmp`;
      await writeFile(temporaryPath, JSON.stringify({ version: 1, states: this.states }, null, 2), 'utf8');
      await rename(temporaryPath, this.filePath);
    };
    this.pendingWrite = this.pendingWrite.then(save, save);
    return this.pendingWrite;
  }
}
