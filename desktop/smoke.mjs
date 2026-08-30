import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import electron from 'electron';

const root = fileURLToPath(new URL('..', import.meta.url));
const runtime = await mkdtemp(join(tmpdir(), 'redbook-desktop-smoke-'));
function run(extraEnv) { return new Promise((resolve, reject) => { const child = spawn(electron, [root, '--smoke-test'], { cwd: root, env: { ...process.env, REDBOOK_DESKTOP_RUNTIME_DIR: runtime, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }); let output = ''; const timer = setTimeout(() => { child.kill(); reject(new Error(`desktop smoke timeout: ${output}`)); }, 30000); child.stdout.on('data', (chunk) => { output += chunk.toString(); }); child.stderr.on('data', (chunk) => { output += chunk.toString(); }); child.once('error', (error) => { clearTimeout(timer); reject(error); }); child.once('exit', (code) => { clearTimeout(timer); code === 0 ? resolve(output) : reject(new Error(output || `desktop smoke exited ${code}`)); }); }); }
try { const first = await run({ REDBOOK_SMOKE_WRITE_ACCOUNT: '1' }); const second = await run({ REDBOOK_SMOKE_EXPECT_ACCOUNT: '1' }); if (!first.includes('REDBOOK_DESKTOP_SMOKE_OK') || !second.includes('REDBOOK_DESKTOP_SMOKE_OK')) throw new Error(`${first}\n${second}`); process.stdout.write(first); process.stdout.write(second); console.log('REDBOOK_DESKTOP_PERSISTENCE_OK'); } finally { await rm(runtime, { recursive: true, force: true }); }
