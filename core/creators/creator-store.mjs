import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { comparableCreator } from './schema.mjs';

export class CreatorStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.records = new Map();
    this.loaded = false;
    this.pendingWrite = Promise.resolve();
  }

  async load() {
    if (this.loaded) return;
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8'));
      for (const record of parsed.creators || []) this.records.set(record.userId, record);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    this.loaded = true;
  }

  async persist() {
    const save = async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.tmp`;
      await writeFile(temporaryPath, JSON.stringify({ version: 1, creators: [...this.records.values()] }, null, 2), 'utf8');
      await rename(temporaryPath, this.filePath);
    };
    this.pendingWrite = this.pendingWrite.then(save, save);
    return this.pendingWrite;
  }

  async list() {
    await this.load();
    return [...this.records.values()].sort((left, right) => Date.parse(right.capturedAt) - Date.parse(left.capturedAt));
  }

  async get(id) {
    await this.load();
    return [...this.records.values()].find((record) => record.id === id) || null;
  }

  async upsertMany(creators) {
    await this.load();
    const result = { received: creators.length, created: 0, updated: 0, duplicates: 0 };
    for (const creator of creators) {
      const existing = this.records.get(creator.userId);
      if (!existing) {
        this.records.set(creator.userId, creator);
        result.created += 1;
      } else if (comparableCreator(existing) === comparableCreator(creator)) {
        this.records.set(creator.userId, { ...existing, capturedAt: creator.capturedAt, source: creator.source });
        result.duplicates += 1;
      } else {
        this.records.set(creator.userId, creator);
        result.updated += 1;
      }
    }
    if (creators.length) await this.persist();
    return result;
  }
}
