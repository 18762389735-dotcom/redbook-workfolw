import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, sep } from 'node:path';
import { CreatorStore } from '../core/creators/creator-store.mjs';
import { AccountStore } from '../core/account/account-store.mjs';
import { OpportunityStateStore } from '../core/opportunities/opportunity-state-store.mjs';
import { SignalStore } from '../core/signals/signal-store.mjs';
import { createAccountApiHandler } from './account-api.mjs';
import { createCreatorsApiHandler } from './creators-api.mjs';
import { createDiscoveryApiHandler } from './discovery-api.mjs';
import { createMatchingApiHandler } from './matching-api.mjs';
import { createOpportunitiesApiHandler } from './opportunities-api.mjs';
import { createSignalsApiHandler } from './signals-api.mjs';
import { createCorsPolicy, enforceCors } from './cors.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function createApi(runtimeRoot) {
  const stores = {
    signalStore: new SignalStore(resolve(runtimeRoot, 'signals.json')),
    creatorStore: new CreatorStore(resolve(runtimeRoot, 'creators.json')),
    accountStore: new AccountStore(resolve(runtimeRoot, 'account.json')),
    opportunityStateStore: new OpportunityStateStore(resolve(runtimeRoot, 'opportunities.json')),
  };
  const signalsApi = createSignalsApiHandler(stores.signalStore);
  const creatorsApi = createCreatorsApiHandler(stores.creatorStore);
  const discoveryApi = createDiscoveryApiHandler(stores.signalStore, stores.creatorStore);
  const accountApi = createAccountApiHandler(stores.accountStore);
  const matchingApi = createMatchingApiHandler(stores);
  const opportunitiesApi = createOpportunitiesApiHandler(stores);
  const api = (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/api/account') return accountApi(request, response);
    if (pathname === '/api/matching' || pathname === '/api/decisions') return matchingApi(request, response);
    if (pathname === '/api/opportunities' || pathname.startsWith('/api/opportunities/')) return opportunitiesApi(request, response);
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
    createReadStream(requested).pipe(response);
  } catch {
    createReadStream(resolve(dist, 'index.html')).pipe(response);
  }
}

export async function startServer({ host, port, production = process.argv.includes('--production'), runtimeRoot, allowedOrigins } = {}) {
  const resolvedRuntimeRoot = resolve(runtimeRoot || process.env.REDBOOK_RUNTIME_ROOT || resolve(root, 'data'));
  const resolvedHost = production ? '127.0.0.1' : (host || process.env.HOST || '127.0.0.1');
  const requestedPort = port ?? (process.env.PORT ? Number(process.env.PORT) : production ? 0 : 5173);
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
  await new Promise((resolvePromise, reject) => {
    const onError = (error) => { server.off('listening', onListening); reject(error); };
    const onListening = () => { server.off('error', onError); resolvePromise(); };
    server.once('error', onError); server.once('listening', onListening); server.listen(requestedPort, resolvedHost);
  });
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
