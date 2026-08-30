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
// longer on Windows than on POSIX. A per-file watchdog also prevents a native
// handle from leaving CI indefinitely without identifying the offending file.
for (const file of files) {
  const code = await new Promise((resolvePromise) => {
    const child = spawn(process.execPath, ['--test', '--test-concurrency=1', file], { cwd: root, stdio: 'inherit', windowsHide: true });
    const timer = setTimeout(() => { console.error(`Test timeout: ${file}`); child.kill(); resolvePromise(1); }, 60_000);
    child.once('error', (error) => { clearTimeout(timer); console.error(error); resolvePromise(1); });
    child.once('exit', (exitCode, signal) => { clearTimeout(timer); resolvePromise(exitCode ?? (signal ? 1 : 0)); });
  });
  if (code !== 0) { process.exitCode = code; break; }
}
