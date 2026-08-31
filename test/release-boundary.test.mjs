import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('Windows package boundary includes runtime and required notices but excludes user data', () => {
  const files = packageJson.build.files;
  for (const required of ['dist/**/*', 'server/**/*', 'core/**/*', 'providers/**/*', 'desktop/**/*', 'vendor/beav/xhs-collector/**/*', 'vendor/beav/plugin-xhs/**/*']) assert.ok(files.includes(required), `${required} should be packaged`);
  assert.ok(files.includes('!vendor/beav/plugin-xhs/reference/**'));
  for (const excluded of ['!data/**', '!test/**', '!release/**']) assert.ok(files.includes(excluded), `${excluded} should be excluded`);
  assert.deepEqual(packageJson.build.extraResources, [
    { from: 'vendor/beav/LICENSE', to: 'vendor/beav/LICENSE' },
    { from: 'THIRD_PARTY_NOTICES.md', to: 'THIRD_PARTY_NOTICES.md' },
  ]);
  assert.equal(existsSync('vendor/beav/LICENSE'), true);
  assert.equal(existsSync('THIRD_PARTY_NOTICES.md'), true);
  assert.equal(packageJson.build.nsis.oneClick, false);
});
