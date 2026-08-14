import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCANNED = [
  'manifest.json',
  'popup.html',
  'popup.js',
  'popup.css',
  'background.js',
  'archive.html',
  'archive.js',
  'archive.css',
  'core/action-feedback.mjs',
  'core/archive-actions.mjs',
  'core/archive-bulk-send.mjs',
  'core/archive-dedup.mjs',
  'core/archive-query.mjs',
  'core/archive-store.mjs',
  'core/capture-feedback.mjs',
  'core/delivery-prerequisites.mjs',
  'core/direct-routing.mjs',
  'core/evidence-card.mjs',
  'core/evidence-migration.mjs',
  'core/evidence-templates.mjs',
  'core/notion-link.mjs',
  'core/page-cleaner.mjs',
  'core/page-structure.mjs',
  'core/project-delivery.mjs',
  'core/projects.mjs',
  'core/proofclip-api.mjs',
  'core/record.mjs',
  'core/region-capture.mjs',
  'core/region-capture-feedback.mjs',
  'core/site-readable-adapters.mjs',
  'core/storage.mjs',
  'core/text.mjs',
  'community-config.mjs'
];

test('all scanned source files exist', async () => {
  for (const file of SCANNED) await assert.doesNotReject(access(resolve(ROOT, file)), file + ' missing');
});

test('extension source contains no commercial identifiers or contact identities', async () => {
  const forbidden = ['subscription', 'quota', 'license', 'bridge', 'gmail.com', 'qq.com', 'workers.dev', 'MIIBIjANBgkqhki', 'works left'];
  for (const file of SCANNED) {
    const content = await readFile(resolve(ROOT, file), 'utf8');
    for (const token of forbidden) {
      assert.ok(!content.toLowerCase().includes(token.toLowerCase()), token + ' must not appear in ' + file);
    }
  }
});
