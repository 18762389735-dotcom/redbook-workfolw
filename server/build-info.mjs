import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(SERVER_DIR, '..');
const GENERATED_BUILD_INFO = join(SERVER_DIR, 'build-info.json');

function readPackageVersion() {
  try {
    const packageJson = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf8'));
    return typeof packageJson.version === 'string' && packageJson.version.trim()
      ? packageJson.version.trim()
      : 'unknown';
  } catch {
    return 'unknown';
  }
}

function readGeneratedBuildCommit() {
  try {
    const generated = JSON.parse(readFileSync(GENERATED_BUILD_INFO, 'utf8'));
    return typeof generated.buildCommit === 'string' && generated.buildCommit.trim()
      ? generated.buildCommit.trim()
      : null;
  } catch {
    return null;
  }
}

function readGitBuildCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || null;
  } catch {
    return null;
  }
}

// Development worktrees have a .git context, while packaged app.asar files
// intentionally do not. Prefer the live repository commit in development and
// fall back to build-info.json generated immediately before packaging.
export const APP_VERSION = readPackageVersion();
export const BUILD_COMMIT = process.env.REDBOOK_BUILD_COMMIT?.trim()
  || process.env.GITHUB_SHA?.trim()
  || (existsSync(join(PROJECT_ROOT, '.git')) ? readGitBuildCommit() : null)
  || readGeneratedBuildCommit()
  || 'unknown';

