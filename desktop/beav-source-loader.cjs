/*
 * Redbook-owned source loader.
 *
 * This module deliberately lives outside vendor/beav: the overlay companion
 * is Redbook code and is not covered by the Beav donor integrity manifest.
 */
const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');

function loadRedbookXhsOverlayCompanionSource(baseDir = __dirname) {
  const sourcePath = path.join(baseDir, 'redbook-xhs-overlay-companion.js');
  if (!existsSync(sourcePath)) {
    throw new Error(`Redbook XHS overlay companion source not found: ${sourcePath}`);
  }
  return readFileSync(sourcePath, 'utf8');
}

module.exports = { loadRedbookXhsOverlayCompanionSource };
