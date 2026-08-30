import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const executable = resolve(root, 'release', 'win-unpacked', 'Redbook Workflow.exe');
const runtime = await mkdtemp(join(process.env.TEMP || process.env.TMP || root, 'redbook-packaged-smoke-'));
function run(extraEnv) { return new Promise((resolvePromise, reject) => { const child = spawn(executable, ['--smoke-test'], { cwd: root, env: { ...process.env, REDBOOK_DESKTOP_RUNTIME_DIR: runtime, ...extraEnv }, stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true }); const timer = setTimeout(() => { child.kill(); reject(new Error('packaged smoke timeout')); }, 30000); child.once('error', (error) => { clearTimeout(timer); reject(error); }); child.once('exit', (code) => { clearTimeout(timer); code === 0 ? resolvePromise() : reject(new Error(`packaged smoke exited ${code}`)); }); }); }
try {
  await run({ REDBOOK_SMOKE_WRITE_ACCOUNT: '1' });
  const firstMarker = await readFile(join(runtime, 'desktop-smoke-result.txt'), 'utf8');
  await run({ REDBOOK_SMOKE_EXPECT_ACCOUNT: '1' });
  const secondMarker = await readFile(join(runtime, 'desktop-smoke-result.txt'), 'utf8');
  if (!firstMarker.startsWith('REDBOOK_DESKTOP_SMOKE_OK ') || !secondMarker.startsWith('REDBOOK_DESKTOP_SMOKE_OK ')) throw new Error('packaged smoke marker missing');
  console.log(firstMarker); console.log(secondMarker); console.log('REDBOOK_DESKTOP_PERSISTENCE_OK');
} catch (error) { console.error(`REDBOOK_DESKTOP_SMOKE_FAILED ${error.message}`); process.exitCode = 1; } finally { await rm(runtime, { recursive: true, force: true }); }
