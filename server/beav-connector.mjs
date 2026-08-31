import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { beavCreatorPayloadToAccountFacts, beavCreatorPayloadToCreatorInput, beavNotePayloadToSignalInput } from '../vendor/beav/plugin-xhs/redbook-payload-adapter.js';
import { normalizeXiaohongshuCreator } from '../providers/xiaohongshu/normalize-creator.mjs';
import { normalizeXiaohongshuSignal } from '../providers/xiaohongshu/normalize.mjs';
import { APP_VERSION, BUILD_COMMIT } from './build-info.mjs';

export const BEAV_CONNECTOR_HOST = '127.0.0.1';
export const BEAV_CONNECTOR_PORT = 43127;
export const BEAV_CONNECTOR_HEADER = 'beav-v1';
const MAX_BODY_BYTES = 10 * 1024 * 1024;
const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-z0-9-]+$/i;

function json(response, status, value, origin = '') {
  const headers = { 'content-type': 'application/json; charset=utf-8', connection: 'close' };
  if (origin && EXTENSION_ORIGIN.test(origin)) {
    headers['access-control-allow-origin'] = origin;
    headers.vary = 'Origin';
  }
  response.writeHead(status, headers);
  response.end(JSON.stringify(value));
}

function textHeader(request, name) {
  const value = request.headers[name];
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function normalizeHost(value) {
  return String(value || '').trim().toLowerCase();
}

function isAllowedHost(value) {
  const host = normalizeHost(value);
  return host === `${BEAV_CONNECTOR_HOST}:${BEAV_CONNECTOR_PORT}` || host === `localhost:${BEAV_CONNECTOR_PORT}`;
}

function isAllowedOrigin(value) {
  return !value || EXTENSION_ORIGIN.test(value);
}

function reject(response, status, message, origin = '') {
  json(response, status, { error: message }, origin);
  return true;
}

function validateRequestBoundary(request, response) {
  const origin = textHeader(request, 'origin').trim();
  if (!isAllowedHost(request.headers.host)) return reject(response, 403, 'connector Host 不被允许', origin);
  if (!isAllowedOrigin(origin)) return reject(response, 403, 'connector Origin 不被允许', origin);

  if (request.method === 'OPTIONS') {
    const requestedHeaders = textHeader(request, 'access-control-request-headers').toLowerCase().split(',').map((value) => value.trim()).filter(Boolean);
    if (origin && (!EXTENSION_ORIGIN.test(origin) || !requestedHeaders.includes('x-redbook-connector'))) return reject(response, 403, 'connector preflight 不被允许', origin);
    const headers = {
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type, x-redbook-connector',
      connection: 'close',
    };
    if (origin) { headers['access-control-allow-origin'] = origin; headers.vary = 'Origin'; }
    response.writeHead(204, headers);
    response.end();
    return true;
  }

  if (textHeader(request, 'x-redbook-connector') !== BEAV_CONNECTOR_HEADER) return reject(response, 403, 'connector header 不被允许', origin);
  return false;
}

async function readJsonBody(request) {
  const declaredLength = Number(request.headers['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) throw Object.assign(new Error('请求体过大'), { statusCode: 413 });
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size <= MAX_BODY_BYTES) chunks.push(chunk);
  }
  if (size > MAX_BODY_BYTES) throw Object.assign(new Error('请求体过大'), { statusCode: 413 });
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw Object.assign(new Error('请求体必须是有效 JSON'), { statusCode: 400 }); }
}

function sourceFor(method, payload, taskId = randomUUID(), capturedAt = new Date().toISOString()) {
  return {
    provider: 'beav-derived-browser-extension',
    method,
    keyword: typeof payload?.keyword === 'string' && payload.keyword.trim() ? payload.keyword.trim() : null,
    taskId,
    capturedAt,
  };
}

function safeMethod(value, fallback) {
  const method = String(value || '').trim();
  return new Set(['current-note', 'visible-notes', 'creator-baseline', 'creator-profile']).has(method) ? method : fallback;
}

function safeCreatorUserId(value) {
  const candidate = String(value || '').trim();
  return /^[A-Za-z0-9_-]{1,128}$/.test(candidate) ? candidate : null;
}

// A homepage/baseline task is the only collector surface where the caller has
// already established one canonical profile owner for every emitted note. Do
// not apply this inheritance to feed, keyword, visible-note, or arbitrary
// current-note captures: those surfaces may contain multiple authors.
export function applyVerifiedCreatorContext(signalInput, source, options = {}) {
  if (source?.method !== 'creator-baseline') return signalInput;
  const creatorUserId = safeCreatorUserId(options?.creatorUserId);
  if (!creatorUserId) return signalInput;
  const author = signalInput?.author && typeof signalInput.author === 'object' ? signalInput.author : {};
  return {
    ...signalInput,
    author: {
      ...author,
      id: creatorUserId,
      name: author.name || (typeof options?.creatorNickname === 'string' && options.creatorNickname.trim() ? options.creatorNickname.trim() : null),
    },
  };
}

function unwrapPayload(body) {
  if (body && typeof body === 'object' && body.__redbook && typeof body.payload === 'object' && body.payload !== null) {
    return { payload: body.payload, options: body.__redbook };
  }
  return { payload: body, options: {} };
}

async function defaultPost(apiBaseUrl, pathname, body) {
  const response = await fetch(new URL(pathname, `${String(apiBaseUrl).replace(/\/$/, '')}/`), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Workbench API ${response.status}`);
  return result;
}

export function createBeavConnector({ apiBaseUrl, ingestSignals, ingestCreators, ingestAccount, host = BEAV_CONNECTOR_HOST, port = BEAV_CONNECTOR_PORT } = {}) {
  if (!apiBaseUrl && (!ingestSignals || !ingestCreators)) throw new TypeError('Beav connector 需要 apiBaseUrl 或注入 ingest handlers');

  const postSignals = ingestSignals || ((payload) => defaultPost(apiBaseUrl, '/api/signals/ingest', payload));
  const postCreators = ingestCreators || ((payload) => defaultPost(apiBaseUrl, '/api/creators/ingest', payload));
  const postAccount = ingestAccount || ((payload) => defaultPost(apiBaseUrl, '/api/account/xhs-sync', payload));

  async function ingestNote(payload, options = {}) {
    const source = sourceFor(options.method || 'current-note', payload, options.taskId, options.capturedAt);
    const signalInput = applyVerifiedCreatorContext(
      beavNotePayloadToSignalInput(payload, source),
      source,
      options,
    );
    const normalized = normalizeXiaohongshuSignal(signalInput, source);
    // The existing API performs the final platform normalization. Keep the
    // adapter-shaped input here so its explicit metrics and source metadata
    // survive that boundary unchanged.
    const result = await postSignals({ signals: [signalInput] });
    return {
      success: true,
      kind: 'signal',
      noteId: normalized.noteId,
      // Safe diagnostic scalar used by the creator-baseline runtime audit.
      // Never expose the raw payload or any session credential here.
      authorId: normalized.author?.id || null,
      ...result,
    };
  }

  async function ingestCreator(payload, options = {}) {
    const source = sourceFor(options.method || 'creator-profile', payload, options.taskId, options.capturedAt);
    const creatorInput = beavCreatorPayloadToCreatorInput(payload, source);
    creatorInput.source = source;
    const normalized = normalizeXiaohongshuCreator(creatorInput, source);
    // Send the adapter-shaped input to the existing API. The API owns the
    // final normalization; sending the already-normalized snapshot would
    // discard Beav's stats fields on that second normalization pass.
    const result = await postCreators({ creators: [creatorInput] });
    return { success: true, kind: 'creator', userId: normalized.userId, ...result };
  }

  async function ingestAccountProfile(payload, options = {}) {
    const source = sourceFor('creator-profile', payload, options.taskId, options.capturedAt);
    const creatorInput = beavCreatorPayloadToCreatorInput(payload, source);
    const result = await postAccount({
      facts: beavCreatorPayloadToAccountFacts(payload, source),
    });
    return {
      success: true,
      kind: 'account',
      userId: creatorInput.userId,
      accountName: creatorInput.nickname,
      profile: result.profile || null,
      ...result,
    };
  }

  async function ingestNotes(payloads, options = {}) {
    const notes = Array.isArray(payloads) ? payloads : payloads?.notes;
    if (!Array.isArray(notes)) throw new TypeError('notes connector payload 必须包含 notes 数组');
    const taskId = options.taskId || randomUUID();
    const capturedAt = options.capturedAt || new Date().toISOString();
    if (options.method === 'creator-baseline') {
      console.info('[redbook-diagnostic] creator-baseline batch context', {
        taskId: String(taskId || ''),
        method: 'creator-baseline',
        creatorUserId: safeCreatorUserId(options.creatorUserId),
        notesLength: notes.length,
      });
    }
    const signals = [];
    const errors = [];
    for (let index = 0; index < notes.length; index += 1) {
      try {
        const source = sourceFor(options.method || 'creator-baseline', notes[index], taskId, capturedAt);
        const input = applyVerifiedCreatorContext(
          beavNotePayloadToSignalInput(notes[index], source),
          source,
          options,
        );
        signals.push(normalizeXiaohongshuSignal(input, source));
      } catch (error) {
        errors.push({ index, error: error instanceof Error ? error.message : String(error) });
      }
    }
    const result = signals.length ? await postSignals({ signals }) : { received: 0, created: 0, updated: 0, duplicates: 0 };
    if (options.method === 'creator-baseline') {
      const distinctSignals = new Map();
      for (const signal of signals) {
        if (signal.noteId && !distinctSignals.has(signal.noteId)) distinctSignals.set(signal.noteId, signal);
      }
      const distinctNoteIds = Array.from(distinctSignals.keys());
      const creatorUserId = safeCreatorUserId(options.creatorUserId);
      const linkedCount = creatorUserId
        ? Array.from(distinctSignals.values()).filter((signal) => signal.author?.id === creatorUserId).length
        : 0;
      console.info('[redbook-diagnostic] creator-baseline normalized', {
        taskId: String(taskId || ''),
        method: 'creator-baseline',
        creatorUserId,
        distinctNoteIds: distinctNoteIds.length,
        creatorLinked: `${linkedCount}/${distinctNoteIds.length}`,
        samples: Array.from(distinctSignals.values()).slice(0, 5).map((signal) => ({ noteId: signal.noteId, authorId: signal.author?.id || null })),
      });
    }
    return { success: true, kind: 'signals', requested: notes.length, errors, ...result };
  }

  async function health() {
    return {
      ok: true,
      service: 'redbook-beav-connector',
      version: 1,
      appVersion: APP_VERSION,
      buildCommit: BUILD_COMMIT,
    };
  }

  const server = createServer(async (request, response) => {
    const origin = textHeader(request, 'origin').trim();
    try {
      if (validateRequestBoundary(request, response)) return;
      const url = new URL(request.url || '/', `http://${BEAV_CONNECTOR_HOST}:${BEAV_CONNECTOR_PORT}`);
      if (request.method === 'GET' && url.pathname === '/health') return json(response, 200, await health(), origin);
      if (request.method !== 'POST') return reject(response, 405, 'connector method 不被允许', origin);
      if (textHeader(request, 'content-type').split(';', 1)[0].trim().toLowerCase() !== 'application/json') return reject(response, 415, 'connector 只接受 application/json', origin);
      if (!['/v1/xhs/note', '/v1/xhs/creator', '/v1/xhs/notes', '/v1/xhs/account'].includes(url.pathname)) return reject(response, 404, 'connector route 不存在', origin);
      const body = await readJsonBody(request);
      if (url.pathname === '/v1/xhs/note') {
        const envelope = unwrapPayload(body);
        return json(response, 200, await ingestNote(envelope.payload, { ...envelope.options, method: safeMethod(envelope.options.method, 'current-note') }), origin);
      }
      if (url.pathname === '/v1/xhs/creator') {
        const envelope = unwrapPayload(body);
        return json(response, 200, await ingestCreator(envelope.payload, { ...envelope.options, method: safeMethod(envelope.options.method, 'creator-profile') }), origin);
      }
      if (url.pathname === '/v1/xhs/account') {
        const envelope = unwrapPayload(body);
        return json(response, 200, await ingestAccountProfile(envelope.payload, envelope.options), origin);
      }
      const notes = Array.isArray(body) ? body : body?.notes;
      const options = body && typeof body === 'object' ? body.__redbook || {} : {};
      return json(response, 200, await ingestNotes(notes, { ...options, method: safeMethod(options.method, 'creator-baseline') }), origin);
    } catch (error) {
      return json(response, error.statusCode || 400, { error: error instanceof Error ? error.message : String(error) }, origin);
    }
  });

  const listen = () => new Promise((resolve, rejectPromise) => {
    const onError = (error) => { server.off('listening', onListening); rejectPromise(error.code === 'EADDRINUSE' ? Object.assign(new Error('REDBOOK_BEAV_CONNECTOR_PORT_IN_USE'), { code: 'REDBOOK_BEAV_CONNECTOR_PORT_IN_USE' }) : error); };
    const onListening = () => { server.off('error', onError); resolve(); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });

  const close = () => new Promise((resolve, rejectPromise) => {
    server.closeAllConnections?.();
    server.close((error) => error ? rejectPromise(error) : resolve());
  });
  return { server, host, port, listen, close, ingestNote, ingestCreator, ingestAccountProfile, ingestNotes, health };
}

export async function startBeavConnector(options = {}) {
  const connector = createBeavConnector(options);
  await connector.listen();
  return connector;
}
