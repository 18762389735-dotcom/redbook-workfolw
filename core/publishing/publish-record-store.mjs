import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const STORE_VERSION = 1;
const metricKeys = ['views', 'likes', 'favorites', 'comments'];
const emptyMetrics = () => Object.fromEntries(metricKeys.map((key) => [key, null]));
const cleanMetrics = (value, previous = emptyMetrics()) => Object.fromEntries(metricKeys.map((key) => {
  const next = value?.[key];
  return [key, next === null || next === undefined || next === '' ? (previous[key] ?? null) : Number.isFinite(Number(next)) && Number(next) >= 0 ? Number(next) : previous[key] ?? null];
}));

export class PublishRecordStore {
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
      for (const record of parsed.records || []) if (record?.id) this.records.set(record.id, record);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    this.loaded = true;
  }

  async persist() {
    const save = async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.tmp`;
      await writeFile(temporaryPath, JSON.stringify({ version: STORE_VERSION, records: [...this.records.values()] }, null, 2), 'utf8');
      await rename(temporaryPath, this.filePath);
    };
    this.pendingWrite = this.pendingWrite.then(save, save);
    return this.pendingWrite;
  }

  async list() {
    await this.load();
    return structuredClone([...this.records.values()].sort((left, right) => Date.parse(right.updatedAt || right.createdAt || 0) - Date.parse(left.updatedAt || left.createdAt || 0)));
  }

  async get(id) {
    await this.load();
    return this.records.has(id) ? structuredClone(this.records.get(id)) : null;
  }

  async getByDraftId(draftId) {
    await this.load();
    const record = [...this.records.values()].find((item) => item.draftId === draftId);
    return record ? structuredClone(record) : null;
  }

  async create(input, now = new Date().toISOString()) {
    if (!input?.draftId || !input?.opportunityId) throw new TypeError('draftId 和 opportunityId 是必填字段');
    if (!String(input.publishedUrl || '').trim()) throw new TypeError('publishedUrl 是必填字段');
    if (!input.publishedAt || Number.isNaN(Date.parse(input.publishedAt))) throw new TypeError('publishedAt 必须是有效时间');
    await this.load();
    const existing = [...this.records.values()].find((item) => item.draftId === input.draftId);
    if (existing) return { record: structuredClone(existing), created: false };
    const record = {
      id: input.id || `publish:${randomUUID()}`,
      draftId: input.draftId,
      opportunityId: input.opportunityId,
      platform: 'xhs',
      publishedUrl: String(input.publishedUrl).trim(),
      publishedAt: new Date(input.publishedAt).toISOString(),
      metrics24h: cleanMetrics(input.metrics24h),
      metrics72h: cleanMetrics(input.metrics72h),
      notes: typeof input.notes === 'string' ? input.notes : '',
      draftTitle: typeof input.draftTitle === 'string' ? input.draftTitle : null,
      opportunityTitle: typeof input.opportunityTitle === 'string' ? input.opportunityTitle : null,
      decisionStatus: typeof input.decisionStatus === 'string' ? input.decisionStatus : null,
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(record.id, record);
    await this.persist();
    return { record: structuredClone(record), created: true };
  }

  async update(id, input, now = new Date().toISOString()) {
    await this.load();
    const existing = this.records.get(id);
    if (!existing) return null;
    const updated = {
      ...existing,
      ...(typeof input.publishedUrl === 'string' && input.publishedUrl.trim() ? { publishedUrl: input.publishedUrl.trim() } : {}),
      ...(input.publishedAt && !Number.isNaN(Date.parse(input.publishedAt)) ? { publishedAt: new Date(input.publishedAt).toISOString() } : {}),
      metrics24h: cleanMetrics(input.metrics24h, existing.metrics24h),
      metrics72h: cleanMetrics(input.metrics72h, existing.metrics72h),
      ...(typeof input.notes === 'string' ? { notes: input.notes } : {}),
      updatedAt: now,
    };
    this.records.set(id, updated);
    await this.persist();
    return structuredClone(updated);
  }
}
