import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const EXTENSION_ROOT = resolve(TEST_DIR, '..', '..');
const API_ROOT = resolve(EXTENSION_ROOT, '..', 'worker');

const EXTENSION_FILES = [
  'src/manifest.json', 'src/popup.html', 'src/popup.css', 'src/popup.js', 'src/background.js',
  'src/archive.html', 'src/archive.css', 'src/archive.js',
  'src/README.md',
  'src/assets/icon-16.png', 'src/assets/icon-32.png', 'src/assets/icon-48.png', 'src/assets/icon-128.png', 'src/assets/proofclip-icon.svg',
  'src/community-config.mjs', 'src/core/action-feedback.mjs', 'src/core/archive-query.mjs', 'src/core/capture-feedback.mjs',
  'src/core/delivery-prerequisites.mjs', 'src/core/direct-routing.mjs', 'src/core/evidence-card.mjs',
  'src/core/evidence-migration.mjs', 'src/core/evidence-templates.mjs', 'src/core/notion-link.mjs',
  'src/core/project-delivery.mjs', 'src/core/projects.mjs', 'src/core/proofclip-api.mjs',
  'src/core/record.mjs', 'src/core/region-capture.mjs', 'src/core/storage.mjs', 'src/core/text.mjs'
];

const API_FILES = [
  'src/index.mjs', 'src/worker.mjs', 'src/notion-proxy.mjs', 'src/d1-repository.mjs',
  'src/oauth.mjs', 'src/token-vault.mjs', 'src/identity.mjs', 'src/schema.sql', 'scripts/bundle-worker.mjs'
];

test('Community source baseline keeps the required extension and Worker files', async () => {
  for (const file of EXTENSION_FILES) {
    await assert.doesNotReject(access(resolve(EXTENSION_ROOT, file)), `extension file missing: ${file}`);
  }
  for (const file of API_FILES) {
    await assert.doesNotReject(access(resolve(API_ROOT, file)), `api file missing: ${file}`);
  }
});
