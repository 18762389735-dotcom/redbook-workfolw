import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, sep } from 'node:path';
import { CreatorStore } from '../core/creators/creator-store.mjs';
import { AccountStore } from '../core/account/account-store.mjs';
import { OpportunityStateStore } from '../core/opportunities/opportunity-state-store.mjs';
import { OpportunityEvaluationStore } from '../core/opportunities/opportunity-evaluation-store.mjs';
import { DraftStore } from '../core/writing/draft-store.mjs';
import { PublishRecordStore } from '../core/publishing/publish-record-store.mjs';
import { SignalStore } from '../core/signals/signal-store.mjs';
import { createAccountApiHandler } from './account-api.mjs';
import { createCreatorsApiHandler } from './creators-api.mjs';
import { createDiscoveryApiHandler } from './discovery-api.mjs';
import { createMatchingApiHandler } from './matching-api.mjs';
import { createOpportunitiesApiHandler } from './opportunities-api.mjs';
import { createWritingApiHandler } from './writing-api.mjs';
import { createPublishingApiHandler } from './publishing-api.mjs';
import { createSignalsApiHandler } from './signals-api.mjs';
import { createCorsPolicy, enforceCors } from './cors.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const STATIC_CONTENT_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.woff2', 'font/woff2'],
]);
const DESKTOP_PORT_MIN = 30000;
const DESKTOP_PORT_SPAN = 20000;
const DESKTOP_PORT_ATTEMPTS = 20;

function staticContentType(filePath) {
  const extension = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  return STATIC_CONTENT_TYPES.get(extension) || 'application/octet-stream';
}

function nextDesktopPort() {
  return DESKTOP_PORT_MIN + Math.floor(Math.random() * DESKTOP_PORT_SPAN);
}

function createApi(runtimeRoot) {
  const stores = {
    signalStore: new SignalStore(resolve(runtimeRoot, 'signals.json')),
    creatorStore: new CreatorStore(resolve(runtimeRoot, 'creators.json')),
    accountStore: new AccountStore(resolve(runtimeRoot, 'account.json')),
    opportunityStateStore: new OpportunityStateStore(resolve(runtimeRoot, 'opportunities.json')),
    opportunityEvaluationStore: new OpportunityEvaluationStore(resolve(runtimeRoot, 'opportunity-evaluations.json')),
    draftStore: new DraftStore(resolve(runtimeRoot, 'drafts.json')),
    publishRecordStore: new PublishRecordStore(resolve(runtimeRoot, 'publish-records.json')),
  };
  const signalsApi = createSignalsApiHandler(stores.signalStore);
  const creatorsApi = createCreatorsApiHandler(stores.creatorStore);
  const discoveryApi = createDiscoveryApiHandler(stores.signalStore, stores.creatorStore);
  const accountApi = createAccountApiHandler(stores.accountStore);
  const matchingApi = createMatchingApiHandler(stores);
  const opportunitiesApi = createOpportunitiesApiHandler(stores);
  const writingApi = createWritingApiHandler(stores);
  const publishingApi = createPublishingApiHandler(stores);
  const api = (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/api/account') return accountApi(request, response);
    if (pathname === '/api/matching' || pathname === '/api/decisions') return matchingApi(request, response);
    if (pathname === '/api/opportunities' || pathname.startsWith('/api/opportunities/')) return opportunitiesApi(request, response);
    if (pathname === '/api/writing' || pathname.startsWith('/api/writing/')) return writingApi(request, response);
    if (pathname === '/api/review' || pathname === '/api/publish-records' || pathname.startsWith('/api/publish-records/')) return publishingApi(request, response);
    if (pathname === '/api/discovery') return discoveryApi(request, response);
    if (pathname === '/api/creators' || pathname.startsWith('/api/creators/')) return creatorsApi(request, response);
    return signalsApi(request, response);
  };
  return { api, stores };
}

async function serveProduction(request, response, api) {
  if (request.url.startsWith('/api/')) return api(request, response);
  const { createReadStream, statSync } = await import('node:fs');
  const dist = resolve(root, 'dist');
  try {
    const requested = request.url === '/' ? resolve(dist, 'index.html') : resolve(dist, `.${request.url}`);
    if (!requested.startsWith(`${dist}${sep}`) || !statSync(requested).isFile()) throw new Error('not file');
    response.writeHead(200, { 'content-type': staticContentType(requested) });
    createReadStream(requested).pipe(response);
  } catch {
    const fallback = resolve(dist, 'index.html');
    response.writeHead(200, { 'content-type': staticContentType(fallback) });
    createReadStream(fallback).pipe(response);
  }
}

export async function startServer({ host, port, production = process.argv.includes('--production'), runtimeRoot, allowedOrigins } = {}) {
  const resolvedRuntimeRoot = resolve(runtimeRoot || process.env.REDBOOK_RUNTIME_ROOT || resolve(root, 'data'));
  const resolvedHost = production ? '127.0.0.1' : (host || process.env.HOST || '127.0.0.1');
  const configuredPort = port ?? (process.env.PORT ? Number(process.env.PORT) : production ? 0 : 5173);
  const requestedPort = production && configuredPort === 0 ? nextDesktopPort() : configuredPort;
  if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) throw new TypeError('PORT 必须是 0–65535 的整数');
  const { api } = createApi(resolvedRuntimeRoot);
  // Production policy is bound after listen so the exact ephemeral port is
  // part of both the same-origin and Host checks.
  let corsPolicy;
  let vite;
  const server = createServer(async (request, response) => {
    // This is a short-lived loopback API/renderer server owned by the desktop
    // process. Closing each response avoids Windows keep-alive handles
    // delaying orderly shutdown and never affects the XHS session itself.
    response.setHeader('connection', 'close');
    if (!corsPolicy) {
      response.writeHead(503, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: '服务器尚未就绪' }));
      return;
    }
    if (enforceCors(request, response, corsPolicy)) return;
    if (production) return serveProduction(request, response, api);
    if (request.url.startsWith('/api/')) return api(request, response);
    vite ||= await (await import('vite')).createServer({ configFile: resolve(root, 'apps/web/vite.config.mjs'), server: { middlewareMode: true } });
    return vite.middlewares(request, response);
  });
  const listen = (candidatePort) => new Promise((resolvePromise, reject) => {
    const onError = (error) => { server.off('listening', onListening); reject(error); };
    const onListening = () => { server.off('error', onError); resolvePromise(); };
    server.once('error', onError); server.once('listening', onListening); server.listen(candidatePort, resolvedHost);
  });
  let bound = false;
  let lastError;
  const attempts = production && configuredPort === 0 ? DESKTOP_PORT_ATTEMPTS : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await listen(attempt === 0 ? requestedPort : nextDesktopPort());
      bound = true;
      break;
    } catch (error) {
      lastError = error;
      if (error?.code !== 'EADDRINUSE' || attempt === attempts - 1) throw error;
    }
  }
  if (!bound) throw lastError || new Error('无法绑定本地服务器端口');
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : requestedPort;
  const url = `http://${resolvedHost}:${actualPort}`;
  corsPolicy = createCorsPolicy({ production, allowedOrigins, sameOrigin: url, allowedHost: `${resolvedHost}:${actualPort}` });
  console.log(`REDBOOK_READY ${url}`);
  return { server, url, host: resolvedHost, port: actualPort, runtimeRoot: resolvedRuntimeRoot };
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (entryPath === fileURLToPath(import.meta.url)) {
  startServer().catch((error) => { console.error(`REDBOOK_FAILED ${error.message}`); process.exitCode = 1; });
}
