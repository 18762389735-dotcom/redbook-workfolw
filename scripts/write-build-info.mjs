import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(SCRIPT_DIR, '..');
const packageJson = JSON.parse(await readFile(join(PROJECT_ROOT, 'package.json'), 'utf8'));

let buildCommit = process.env.REDBOOK_BUILD_COMMIT?.trim() || process.env.GITHUB_SHA?.trim() || '';
if (!buildCommit) {
  try {
    buildCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    buildCommit = 'unknown';
  }
}

const outputPath = join(PROJECT_ROOT, 'server', 'build-info.json');
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({
  appVersion: String(packageJson.version || 'unknown'),
  buildCommit: buildCommit || 'unknown',
}, null, 2)}\n`, 'utf8');
console.log(`Wrote build metadata: ${outputPath}`);

