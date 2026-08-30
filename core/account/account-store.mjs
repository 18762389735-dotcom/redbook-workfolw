import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createAccountProfile, emptyAccountProfile } from './schema.mjs';

export class AccountStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.profile = null;
    this.loaded = false;
    this.pendingWrite = Promise.resolve();
  }

  async load() {
    if (this.loaded) return;
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8'));
      this.profile = { ...emptyAccountProfile(), ...parsed, currentContext: { ...emptyAccountProfile().currentContext, ...(parsed.currentContext || {}) } };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.profile = emptyAccountProfile();
    }
    this.loaded = true;
  }

  async get() {
    await this.load();
    return structuredClone(this.profile);
  }

  async update(input, now = new Date().toISOString()) {
    await this.load();
    this.profile = createAccountProfile(input, now);
    await this.persist();
    return this.get();
  }

  async persist() {
    const save = async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.tmp`;
      await writeFile(temporaryPath, JSON.stringify(this.profile, null, 2), 'utf8');
      await rename(temporaryPath, this.filePath);
    };
    this.pendingWrite = this.pendingWrite.then(save, save);
    return this.pendingWrite;
  }
}
