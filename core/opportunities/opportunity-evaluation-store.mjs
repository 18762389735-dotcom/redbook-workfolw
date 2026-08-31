import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const STORE_VERSION = 1;

/**
 * Persists the user's explicit request to evaluate a Signal as an Opportunity.
 * This is intentionally separate from the derived Discovery/Matching output:
 * missing evidence must not be manufactured or mutate those algorithms.
 */
export class OpportunityEvaluationStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.signalIds = new Set();
    this.loaded = false;
    this.pendingWrite = Promise.resolve();
  }

  async load() {
    if (this.loaded) return;
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8'));
      for (const id of parsed.signalIds || []) if (typeof id === 'string' && id) this.signalIds.add(id);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    this.loaded = true;
  }

  async listSignalIds() {
    await this.load();
    return [...this.signalIds];
  }

  async evaluate(signalId) {
    if (typeof signalId !== 'string' || !signalId.trim()) throw new TypeError('signalId 是必填字段');
    await this.load();
    const normalized = signalId.trim();
    const created = !this.signalIds.has(normalized);
    this.signalIds.add(normalized);
    if (created) await this.persist();
    return { signalId: normalized, created };
  }

  async persist() {
    const save = async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.tmp`;
      await writeFile(temporaryPath, JSON.stringify({ version: STORE_VERSION, signalIds: [...this.signalIds] }, null, 2), 'utf8');
      await rename(temporaryPath, this.filePath);
    };
    this.pendingWrite = this.pendingWrite.then(save, save);
    return this.pendingWrite;
  }
}
