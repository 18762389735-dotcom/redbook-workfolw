import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const files = (await readdir(resolve(root, 'test')))
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => resolve(root, 'test', name));

// Keep the suite deterministic on the Windows runner: several tests start
// short-lived loopback servers and parallel test files can retain sockets
// longer on Windows than on POSIX.
const child = spawn(process.execPath, ['--test', '--test-concurrency=1', ...files], { cwd: root, stdio: 'inherit', windowsHide: true });
child.once('error', (error) => { console.error(error); process.exitCode = 1; });
child.once('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
