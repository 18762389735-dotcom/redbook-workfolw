import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const STORE_VERSION = 1;

export class DraftStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.drafts = new Map();
    this.loaded = false;
    this.pendingWrite = Promise.resolve();
  }

  async load() {
    if (this.loaded) return;
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8'));
      for (const draft of parsed.drafts || []) if (draft?.id) this.drafts.set(draft.id, draft);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    this.loaded = true;
  }

  async persist() {
    const save = async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.tmp`;
      await writeFile(temporaryPath, JSON.stringify({ version: STORE_VERSION, drafts: [...this.drafts.values()] }, null, 2), 'utf8');
      await rename(temporaryPath, this.filePath);
    };
    this.pendingWrite = this.pendingWrite.then(save, save);
    return this.pendingWrite;
  }

  async list() {
    await this.load();
    return structuredClone([...this.drafts.values()].sort((left, right) => Date.parse(right.updatedAt || right.createdAt || 0) - Date.parse(left.updatedAt || left.createdAt || 0)));
  }

  async get(id) {
    await this.load();
    return this.drafts.has(id) ? structuredClone(this.drafts.get(id)) : null;
  }

  async getByOpportunityId(opportunityId) {
    await this.load();
    const draft = [...this.drafts.values()].find((value) => value.opportunityId === opportunityId);
    return draft ? structuredClone(draft) : null;
  }

  async createIfMissing(draft) {
    await this.load();
    const existing = this.drafts.get(draft.id);
    if (existing) return { draft: structuredClone(existing), created: false };
    this.drafts.set(draft.id, structuredClone(draft));
    await this.persist();
    return { draft: structuredClone(draft), created: true };
  }

  async update(id, input, now = new Date().toISOString()) {
    await this.load();
    const existing = this.drafts.get(id);
    if (!existing) return null;
    const title = typeof input?.title === 'string' ? input.title.trim() : existing.title;
    const body = typeof input?.body === 'string' ? input.body : existing.body;
    if (!title || !String(body).trim()) throw new TypeError('标题和正文不能为空');
    const updated = { ...existing, title, body, updatedAt: now };
    this.drafts.set(id, updated);
    await this.persist();
    return structuredClone(updated);
  }
}
