import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { buildAccountProfileAnalysis, analysisFieldMetadata } from './profile-analysis.mjs';
import { createAccountProfile, emptyAccountProfile, normalizeRecentContent, normalizeXhsAccountFacts } from './schema.mjs';

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
      const empty = emptyAccountProfile();
      this.profile = {
        ...empty,
        ...parsed,
        currentContext: { ...empty.currentContext, ...(parsed.currentContext || {}) },
        recentContent: { ...empty.recentContent, ...(parsed.recentContent || {}), notes: Array.isArray(parsed.recentContent?.notes) ? parsed.recentContent.notes : [] },
        fieldSources: parsed.fieldSources && typeof parsed.fieldSources === 'object' ? parsed.fieldSources : {},
        fieldMetadata: parsed.fieldMetadata && typeof parsed.fieldMetadata === 'object' ? parsed.fieldMetadata : {},
      };
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
    const previous = this.profile;
    const mergedInput = {
      ...previous,
      ...(input && typeof input === 'object' ? input : {}),
      currentContext: { ...previous.currentContext, ...(input?.currentContext || {}) },
      facts: input?.facts === undefined ? previous.facts : input.facts,
      recentContent: input?.recentContent === undefined ? previous.recentContent : input.recentContent,
    };
    const next = createAccountProfile(mergedInput, now);
    const confirmedFields = [
      'displayName', 'positioning', 'niche', 'targetAudience', 'contentPillars', 'accountPromise',
      'valuePromise', 'strengths', 'weaknesses', 'contentBoundaries', 'privacyConstraints',
      'currentContext.recentlyDoing', 'currentContext.currentProjects', 'currentContext.currentTools',
      'currentContext.currentLearning', 'currentContext.currentGoals',
    ];
    const sources = { ...(previous.fieldSources || {}), ...(next.fieldSources || {}) };
    if (Object.keys(previous.fieldSources || {}).length) {
      for (const field of confirmedFields) {
        const isNested = field.startsWith('currentContext.');
        if (isNested ? Object.prototype.hasOwnProperty.call(input?.currentContext || {}, field.slice('currentContext.'.length)) : Object.prototype.hasOwnProperty.call(input || {}, field)) {
          sources[field] = 'user_confirmed';
          if (field === 'accountPromise') sources.valuePromise = 'user_confirmed';
        }
      }
    } else {
      for (const field of confirmedFields) sources[field] = 'user_confirmed';
    }
    next.fieldSources = sources;
    next.fieldMetadata = { ...(previous.fieldMetadata || {}), ...(input?.fieldMetadata || {}) };
    this.profile = next;
    await this.persist();
    return this.get();
  }

  async syncXhsProfile(input, { notes = [], now = new Date().toISOString() } = {}) {
    await this.load();
    const previous = this.profile;
    const facts = normalizeXhsAccountFacts(input, now);
    const recentContent = normalizeRecentContent(notes, now);
    const next = { ...previous, facts, recentContent, updatedAt: now };
    const sources = { ...(previous.fieldSources || {}) };
    const metadata = { ...(previous.fieldMetadata || {}) };
    if (!previous.displayName || sources.displayName !== 'user_confirmed') {
      next.displayName = facts.accountName;
      sources.displayName = 'xhs_profile';
      metadata.displayName = { source: 'xhs_profile', type: 'fact', updatedAt: now };
    }
    next.fieldSources = sources;
    next.fieldMetadata = metadata;
    this.profile = next;
    await this.persist();
    return this.get();
  }

  async analyzeXhsProfile({ notes, now = new Date().toISOString() } = {}) {
    await this.load();
    const previous = this.profile;
    const analysis = buildAccountProfileAnalysis({ facts: previous.facts || {}, notes: notes === undefined ? previous.recentContent?.notes || [] : notes, now });
    const next = { ...previous, recentContent: analysis.recentContent, updatedAt: now };
    const sources = { ...(previous.fieldSources || {}) };
    const metadata = { ...(previous.fieldMetadata || {}) };
    const fields = ['positioning', 'niche', 'targetAudience', 'contentPillars', 'accountPromise', 'strengths', 'weaknesses', 'contentBoundaries'];
    for (const field of fields) {
      if (sources[field] === 'user_confirmed') continue;
      next[field] = analysis[field];
      sources[field] = 'ai_profile_analysis';
      metadata[field] = { source: 'ai_profile_analysis', type: 'inferred', updatedAt: now };
    }
    next.valuePromise = next.accountPromise;
    next.profileAnalysis = {
      profileConfidence: analysis.profileConfidence,
      topics: analysis.topics,
      recurringThemes: analysis.recurringThemes,
      contentFormats: analysis.contentFormats,
      highPerformingThemes: analysis.highPerformingThemes,
      source: 'ai_profile_analysis',
      type: 'inferred',
      analyzedAt: now,
      noteCount: analysis.noteCount,
    };
    next.fieldSources = sources;
    next.fieldMetadata = { ...metadata, ...Object.fromEntries(fields.filter((field) => sources[field] === 'ai_profile_analysis').map((field) => [field, metadata[field] || analysisFieldMetadata(now)[field]])) };
    this.profile = next;
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
