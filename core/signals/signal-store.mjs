import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { comparableSignal, mergeSignalFacts } from './schema.mjs';

export class SignalStore {
  constructor(filePath) { this.filePath = filePath; this.records = new Map(); this.loaded = false; this.pendingWrite = Promise.resolve(); }
  async load() { if (this.loaded) return; try { const parsed = JSON.parse(await readFile(this.filePath, 'utf8')); for (const record of parsed.signals || []) this.records.set(record.noteId, record); } catch (error) { if (error.code !== 'ENOENT') throw error; } this.loaded = true; }
  async persist() { const save = async () => { await mkdir(dirname(this.filePath), { recursive: true }); const tmp = `${this.filePath}.tmp`; await writeFile(tmp, JSON.stringify({ version: 1, signals: [...this.records.values()] }, null, 2), 'utf8'); await rename(tmp, this.filePath); }; this.pendingWrite = this.pendingWrite.then(save, save); return this.pendingWrite; }
  async list() { await this.load(); return [...this.records.values()].sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt)); }
  async listWithMetadata() { const signals = await this.list(); const latest = signals.find((signal) => signal.source?.taskId) || null; return { signals, latestTaskId: latest?.source?.taskId || null, latestCapturedAt: latest?.capturedAt || null }; }
  async get(id) { await this.load(); return [...this.records.values()].find((record) => record.id === id) || null; }
  async delete(id) { await this.load(); const record = await this.get(id); if (!record) return false; this.records.delete(record.noteId); await this.persist(); return true; }
  async upsertMany(signals) { await this.load(); const result = { received: signals.length, created: 0, updated: 0, duplicates: 0 }; for (const signal of signals) { const existing = this.records.get(signal.noteId); if (!existing) { this.records.set(signal.noteId, signal); result.created += 1; continue; } const merged = mergeSignalFacts(existing, signal); if (comparableSignal(existing) === comparableSignal(merged)) { this.records.set(signal.noteId, { ...existing, capturedAt: signal.capturedAt, source: signal.source }); result.duplicates += 1; continue; } this.records.set(signal.noteId, merged); result.updated += 1; } if (signals.length) await this.persist(); return result; }
}
