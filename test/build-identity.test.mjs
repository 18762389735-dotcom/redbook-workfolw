import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { test } from 'node:test';
import { APP_VERSION, BUILD_COMMIT } from '../server/build-info.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('build identity follows package version and current source commit', async () => {
  const packageJson = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  const currentCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();
  assert.equal(APP_VERSION, packageJson.version);
  assert.equal(BUILD_COMMIT, currentCommit);
  assert.match(packageJson.scripts['package:win'], /write-build-info\.mjs/);
});

test('popup exposes connector build identity without exposing credentials', async () => {
  const popup = await readFile(join(ROOT, 'extension', 'beav-redbook', 'src', 'popup.js'), 'utf8');
  const popupHtml = await readFile(join(ROOT, 'extension', 'beav-redbook', 'src', 'popup.html'), 'utf8');
  assert.match(popupHtml, /id="build-identity"/);
  assert.match(popup, /buildCommit/);
  assert.match(popup, /Connected Workbench: buildCommit/);
  assert.doesNotMatch(popup, /refreshToken|access_token|cookie/i);
});

test('creator-baseline diagnostics stay limited to safe identity/count fields', async () => {
  const background = await readFile(join(ROOT, 'extension', 'beav-redbook', 'src', 'background.js'), 'utf8');
  assert.match(background, /creator-baseline-batch-context/);
  assert.match(background, /creator-baseline-normalized/);
  assert.match(background, /notesLength/);
  assert.match(background, /distinctNoteIds/);
  assert.match(background, /creatorLinked/);
  assert.match(background, /authorId/);
});
