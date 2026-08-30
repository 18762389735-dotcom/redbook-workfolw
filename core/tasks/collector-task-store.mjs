import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const STORE_VERSION = 1;
const ACTIVE_STATUSES = new Set(['queued', 'running']);
const VALID_STATUSES = new Set(['queued', 'running', 'completed', 'partial', 'failed', 'cancelled']);
const now = () => new Date().toISOString();

function normalizeTask(task) {
  const status = task.status || 'queued';
  if (!VALID_STATUSES.has(status)) throw new TypeError('collector task status is invalid');
  return {
    ...task,
    id: String(task.id), method: String(task.method || 'visible-notes'), status,
    createdAt: task.createdAt || now(), startedAt: task.startedAt || null, updatedAt: task.updatedAt || task.createdAt || now(), completedAt: task.completedAt || null,
    progress: { current: Number(task.progress?.current) || 0, total: Number(task.progress?.total) || 0 },
    result: { received: Number(task.result?.received) || 0, created: Number(task.result?.created) || 0, updated: Number(task.result?.updated) || 0, duplicates: Number(task.result?.duplicates) || 0 },
    failures: Array.isArray(task.failures) ? task.failures : [], error: task.error || null,
  };
}

export class CollectorTaskStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.tasks = new Map();
    this.loaded = false;
    this.pendingWrite = Promise.resolve();
  }

  async load() {
    if (this.loaded) return;
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8'));
      for (const task of parsed.tasks || []) this.tasks.set(task.id, normalizeTask(task));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    this.loaded = true;
  }

  async persist() {
    const save = async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporary = `${this.filePath}.tmp`;
      await writeFile(temporary, JSON.stringify({ version: STORE_VERSION, tasks: [...this.tasks.values()] }, null, 2), 'utf8');
      await rename(temporary, this.filePath);
    };
    this.pendingWrite = this.pendingWrite.then(save, save);
    return this.pendingWrite;
  }

  async create(method, total = 0) {
    await this.load();
    const timestamp = now();
    const task = normalizeTask({ id: randomUUID(), method, status: 'queued', createdAt: timestamp, updatedAt: timestamp, progress: { current: 0, total } });
    this.tasks.set(task.id, task);
    await this.persist();
    return structuredClone(task);
  }

  async get(id) {
    await this.load();
    const task = this.tasks.get(id);
    return task ? structuredClone(task) : null;
  }

  async list() {
    await this.load();
    return [...this.tasks.values()].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)).map((task) => structuredClone(task));
  }

  async update(id, patch) {
    await this.load();
    const existing = this.tasks.get(id);
    if (!existing) return null;
    const status = existing.status === 'cancelled' && patch.status && patch.status !== 'cancelled'
      ? existing.status
      : patch.status || existing.status;
    const next = normalizeTask({ ...existing, ...patch, status, progress: { ...existing.progress, ...(patch.progress || {}) }, result: { ...existing.result, ...(patch.result || {}) }, updatedAt: now() });
    this.tasks.set(id, next);
    await this.persist();
    return structuredClone(next);
  }

  async cancel(id) {
    await this.load();
    const existing = this.tasks.get(id);
    if (!existing || !ACTIVE_STATUSES.has(existing.status)) return null;
    return this.update(id, { status: 'cancelled', completedAt: now() });
  }
}
