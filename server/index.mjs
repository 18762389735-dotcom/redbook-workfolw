import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { CreatorStore } from '../core/creators/creator-store.mjs';
import { SignalStore } from '../core/signals/signal-store.mjs';
import { AccountStore } from '../core/account/account-store.mjs';
import { OpportunityStateStore } from '../core/opportunities/opportunity-state-store.mjs';
import { createAccountApiHandler } from './account-api.mjs';
import { createCreatorsApiHandler } from './creators-api.mjs';
import { createDiscoveryApiHandler } from './discovery-api.mjs';
import { createSignalsApiHandler } from './signals-api.mjs';
import { createMatchingApiHandler } from './matching-api.mjs';
import { createOpportunitiesApiHandler } from './opportunities-api.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Electron can inject app.getPath('userData') through REDBOOK_RUNTIME_ROOT.
// The repository data/ directory remains only the development default.
const runtimeRoot = resolve(process.env.REDBOOK_RUNTIME_ROOT || resolve(root, 'data'));
const store = new SignalStore(resolve(runtimeRoot, 'signals.json'));
const creatorStore = new CreatorStore(resolve(runtimeRoot, 'creators.json'));
const accountStore = new AccountStore(resolve(runtimeRoot, 'account.json'));
const opportunityStateStore = new OpportunityStateStore(resolve(runtimeRoot, 'opportunities.json'));
const signalsApi = createSignalsApiHandler(store);
const creatorsApi = createCreatorsApiHandler(creatorStore);
const discoveryApi = createDiscoveryApiHandler(store, creatorStore);
const accountApi = createAccountApiHandler(accountStore);
const derivedStores = { signalStore: store, creatorStore, accountStore, opportunityStateStore };
const matchingApi = createMatchingApiHandler(derivedStores);
const opportunitiesApi = createOpportunitiesApiHandler(derivedStores);
const api = (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/api/account') return accountApi(request, response);
  if (pathname === '/api/matching' || pathname === '/api/decisions') return matchingApi(request, response);
  if (pathname === '/api/opportunities' || pathname.startsWith('/api/opportunities/')) return opportunitiesApi(request, response);
  if (pathname === '/api/discovery') return discoveryApi(request, response);
  if (pathname === '/api/creators' || pathname.startsWith('/api/creators/')) return creatorsApi(request, response);
  return signalsApi(request, response);
};
const production = process.argv.includes('--production');
if (production) { const { createReadStream, statSync } = await import('node:fs'); const dist = resolve(root, 'dist'); createServer(async (request, response) => { if (request.url.startsWith('/api/')) return api(request, response); try { const file = request.url === '/' ? resolve(dist, 'index.html') : resolve(dist, `.${request.url}`); if (!statSync(file).isFile()) throw new Error('not file'); createReadStream(file).pipe(response); } catch { createReadStream(resolve(dist, 'index.html')).pipe(response); } }).listen(5173, () => console.log('http://localhost:5173')); } else { const { createServer: createViteServer } = await import('vite'); const vite = await createViteServer({ configFile: resolve(root, 'apps/web/vite.config.mjs'), server: { middlewareMode: true } }); createServer((request, response) => request.url.startsWith('/api/') ? api(request, response) : vite.middlewares(request, response)).listen(5173, () => console.log('http://localhost:5173')); }
