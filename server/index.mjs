import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { SignalStore } from '../core/signals/signal-store.mjs';
import { createSignalsApiHandler } from './signals-api.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const store = new SignalStore(resolve(root, 'data/signals.json'));
const api = createSignalsApiHandler(store);
const production = process.argv.includes('--production');
if (production) { const { createReadStream, statSync } = await import('node:fs'); const dist = resolve(root, 'dist'); createServer(async (request, response) => { if (request.url.startsWith('/api/')) return api(request, response); try { const file = request.url === '/' ? resolve(dist, 'index.html') : resolve(dist, `.${request.url}`); if (!statSync(file).isFile()) throw new Error('not file'); createReadStream(file).pipe(response); } catch { createReadStream(resolve(dist, 'index.html')).pipe(response); } }).listen(5173, () => console.log('http://localhost:5173')); } else { const { createServer: createViteServer } = await import('vite'); const vite = await createViteServer({ configFile: resolve(root, 'apps/web/vite.config.mjs'), server: { middlewareMode: true } }); createServer((request, response) => request.url.startsWith('/api/') ? api(request, response) : vite.middlewares(request, response)).listen(5173, () => console.log('http://localhost:5173')); }
