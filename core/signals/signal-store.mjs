import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { getLatestObservation, getObservations, mergeObservations, observationToSource } from './provenance.mjs';
import { comparableSignal, mergeSignalFacts } from './schema.mjs';

const STORE_VERSION = 2;

function migrateRecord(record) {
  const observations = getObservations(record);
  const latest = getLatestObservation(observations);
  return {
    ...record,
    capturedAt: latest?.capturedAt || record.capturedAt,
    source: observationToSource(latest) || record.source,
    observations,
  };
}

function latestAcrossSignals(signals) {
  let latest = null;
  for (const signal of signals) for (const observation of getObservations(signal)) {
    if (!latest || (Date.parse(observation.capturedAt) || 0) >= (Date.parse(latest.capturedAt) || 0)) latest = observation;
  }
  return latest;
}

export class SignalStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.records = new Map();
    this.loaded = false;
    this.pendingWrite = Promise.resolve();
  }

  async load() {
    if (this.loaded) return;
    let migrationRequired = false;
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8'));
      migrationRequired = parsed.version !== STORE_VERSION;
      for (const record of parsed.signals || []) {
        if (!Array.isArray(record.observations) || !record.observations.length) migrationRequired = true;
        const migrated = migrateRecord(record);
        this.records.set(migrated.noteId, migrated);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    this.loaded = true;
    if (migrationRequired) await this.persist();
  }

  async persist() {
    const save = async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.tmp`;
      await writeFile(temporaryPath, JSON.stringify({ version: STORE_VERSION, signals: [...this.records.values()] }, null, 2), 'utf8');
      await rename(temporaryPath, this.filePath);
    };
    this.pendingWrite = this.pendingWrite.then(save, save);
    return this.pendingWrite;
  }

  async list() {
    await this.load();
    return [...this.records.values()].sort((left, right) => Date.parse(getLatestObservation(right)?.capturedAt) - Date.parse(getLatestObservation(left)?.capturedAt));
  }

  async listWithMetadata() {
    const signals = await this.list();
    const latest = latestAcrossSignals(signals);
    return { signals, latestTaskId: latest?.taskId || null, latestCapturedAt: latest?.capturedAt || null };
  }

  async get(id) {
    await this.load();
    return [...this.records.values()].find((record) => record.id === id) || null;
  }

  async delete(id) {
    await this.load();
    const record = await this.get(id);
    if (!record) return false;
    this.records.delete(record.noteId);
    await this.persist();
    return true;
  }

  async upsertMany(signals) {
    await this.load();
    const result = { received: signals.length, created: 0, updated: 0, duplicates: 0 };
    for (const incoming of signals) {
      const existing = this.records.get(incoming.noteId);
      if (!existing) {
        this.records.set(incoming.noteId, migrateRecord(incoming));
        result.created += 1;
        continue;
      }
      const mergedFacts = mergeSignalFacts(existing, incoming);
      const observations = mergeObservations(getObservations(existing), getObservations(incoming));
      const latest = getLatestObservation(observations);
      const merged = {
        ...mergedFacts,
        capturedAt: latest?.capturedAt || mergedFacts.capturedAt,
        source: observationToSource(latest) || mergedFacts.source,
        observations,
      };
      this.records.set(incoming.noteId, merged);
      if (comparableSignal(existing) === comparableSignal(merged)) result.duplicates += 1;
      else result.updated += 1;
    }
    if (signals.length) await this.persist();
    return result;
  }
}
