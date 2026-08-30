import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import electron from 'electron';

const root = fileURLToPath(new URL('..', import.meta.url));
const runtime = await mkdtemp(join(tmpdir(), 'redbook-lifecycle-smoke-'));
try {
  const output = await new Promise((resolve, reject) => {
    const child = spawn(electron, [root, '--smoke-test', '--lifecycle-smoke'], { cwd: root, env: { ...process.env, REDBOOK_DESKTOP_RUNTIME_DIR: runtime }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let text = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error(`lifecycle smoke timeout: ${text}`)); }, 30000);
    child.stdout.on('data', (chunk) => { text += chunk.toString(); });
    child.stderr.on('data', (chunk) => { text += chunk.toString(); });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => { clearTimeout(timer); code === 0 ? resolve(text) : reject(new Error(text || `lifecycle smoke exited ${code}`)); });
  });
  if (output.match(/Object has been destroyed|uncaughtException|unhandledRejection/i)) throw new Error(output);
  if (!output.includes('REDBOOK_XHS_LIFECYCLE_SMOKE_OK')) throw new Error(output);
  process.stdout.write(output);
} finally {
  await rm(runtime, { recursive: true, force: true });
}
