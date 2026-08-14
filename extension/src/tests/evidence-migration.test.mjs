import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateEvidenceState } from '../core/evidence-migration.mjs';

function todayKey() {
  const now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
}

test('legacy archive history migrates without recreating any quota state', () => {
  const card = {
    id: 'legacy-card', title: 'Legacy evidence', canonicalUrl: 'https://example.test', capturedAt: '2026-07-29T01:00:00.000Z',
    mode: 'body', bodyText: 'Evidence', bodySha256: 'hash', truncated: false, delivery: { status: 'PENDING' }
  };
  const migrated = migrateEvidenceState({ archive: [card, card, card, card], outbox: [] });
  assert.equal(migrated.archive.length, 4);
  assert.equal('quota' in migrated, false);
  assert.equal('quotaReservations' in migrated, false);
  assert.equal('usageCounters' in migrated, false);
});

test('migration retains valid body content blocks and clears malformed legacy structure', () => {
  const base = {
    title: 'Article', canonicalUrl: 'https://example.test/article', capturedAt: '2026-08-09T00:00:00.000Z',
    bodyText: 'Readable fallback', bodySha256: 'hash', truncated: false, delivery: { status: 'PENDING' }
  };
  const migrated = migrateEvidenceState({
    archive: [
      { ...base, id: 'body-1', mode: 'body', contentBlocks: [{ type: 'heading_1', text: 'Article title' }] },
      { ...base, id: 'selection-1', mode: 'selection', contentBlocks: [{ type: 'paragraph', text: 'Must not persist' }] },
      { ...base, id: 'legacy-1', mode: 'body', contentBlocks: { type: 'paragraph', text: 'Malformed' } }
    ],
    outbox: []
  });
  assert.deepEqual(migrated.archive[0].contentBlocks, [{ type: 'heading_1', text: 'Article title' }]);
  assert.deepEqual(migrated.archive[1].contentBlocks, []);
  assert.deepEqual(migrated.archive[2].contentBlocks, []);
});

test('migrates legacy state without captureRoute to archive', () => {
  const migrated = migrateEvidenceState({ archive: [], outbox: [], settings: { dataSourceId: 'src' } });
  assert.equal(migrated.settings.captureRoute, 'archive');
  assert.deepEqual(migrated.projects, [{ id: 'unfiled', name: 'Unfiled', createdAt: null }]);
});
