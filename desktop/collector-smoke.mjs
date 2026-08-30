import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import electron from 'electron';

const root = fileURLToPath(new URL('..', import.meta.url));
const runtime = await mkdtemp(join(tmpdir(), 'redbook-collector-smoke-'));
const output = await new Promise((resolve, reject) => {
  const child = spawn(electron, [root, '--smoke-test', '--collector-smoke'], { cwd: root, env: { ...process.env, REDBOOK_DESKTOP_RUNTIME_DIR: runtime }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let text = '';
  const timer = setTimeout(() => { child.kill(); reject(new Error(`collector smoke timeout: ${text}`)); }, 30000);
  child.stdout.on('data', (chunk) => { text += chunk.toString(); });
  child.stderr.on('data', (chunk) => { text += chunk.toString(); });
  child.once('error', (error) => { clearTimeout(timer); reject(error); });
  child.once('exit', (code) => { clearTimeout(timer); code === 0 ? resolve(text) : reject(new Error(text || `collector smoke exited ${code}`)); });
});
try {
  if (!output.includes('REDBOOK_DESKTOP_COLLECTOR_SMOKE_OK')) throw new Error(output);
  process.stdout.write(output);
} finally {
  await rm(runtime, { recursive: true, force: true });
}
