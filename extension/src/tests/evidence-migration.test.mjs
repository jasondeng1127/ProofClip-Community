import test from 'node:test';
import assert from 'node:assert/strict';
import { ARCHIVE_SCHEMA_VERSION, migrateEvidenceState } from '../core/evidence-migration.mjs';

test('migrates legacy v0.4.5 archive records without losing source or delivery history', () => {
  const legacy = {
    settings: { dataSourceId: 'target-1', titleProperty: 'Name', urlProperty: 'URL' },
    archive: [{
      id: 'legacy-1', title: 'Acme price page', canonicalUrl: 'https://example.test/price', capturedAt: '2026-07-29T01:00:00.000Z',
      mode: 'body', bodyText: 'Original evidence', bodySha256: 'hash', truncated: false,
      delivery: { status: 'SENT', notionUrl: 'https://www.notion.so/abc' }
    }],
    outbox: []
  };

  const migrated = migrateEvidenceState(legacy);
  assert.equal(migrated.schemaVersion, ARCHIVE_SCHEMA_VERSION);
  assert.equal(migrated.archive[0].projectId, 'unfiled');
  assert.deepEqual(migrated.archive[0].tags, []);
  assert.equal(migrated.archive[0].screenshot, null);
  assert.equal(migrated.archive[0].canonicalUrl, 'https://example.test/price');
  assert.equal(migrated.archive[0].delivery.notionUrl, 'https://www.notion.so/abc');
  assert.deepEqual(migrated.projects, [{ id: 'unfiled', name: 'Unfiled', createdAt: null }]);
  assert.equal(Object.hasOwn(migrated, 'quota'), false);
});

test('migrates legacy state without captureRoute to archive', () => {
  const legacy = {
    settings: { dataSourceId: 'target-1', titleProperty: 'Name', urlProperty: 'URL' },
    archive: [],
    outbox: []
  };
  const migrated = migrateEvidenceState(legacy);
  assert.equal(migrated.settings.captureRoute, 'archive');
});

test('preserves an existing valid captureRoute unchanged', () => {
  const state = {
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    settings: { dataSourceId: 'ds-1', captureRoute: 'direct' },
    archive: [],
    outbox: [],
    projects: [{ id: 'unfiled', name: 'Unfiled', createdAt: null }]
  };
  const migrated = migrateEvidenceState(state);
  assert.equal(migrated.settings.captureRoute, 'direct');
});

test('migrates legacy outbox items to retryState RETRYABLE without losing cards', () => {
  const record = {
    id: 'card-1', title: 'Test', canonicalUrl: 'https://example.test', capturedAt: '2026-08-01T00:00:00.000Z',
    mode: 'body', bodyText: 'evidence', bodySha256: 'abc', truncated: false,
    delivery: { status: 'FAILED', updatedAt: '2026-08-01T00:00:00.000Z', error: 'Network error' }
  };
  const legacy = {
    settings: {},
    archive: [],
    outbox: [{ id: 'out-1', record, error: 'Failed', createdAt: '2026-08-01T00:00:00.000Z' }]
  };
  const migrated = migrateEvidenceState(legacy);
  assert.equal(migrated.outbox.length, 1);
  assert.equal(migrated.outbox[0].id, 'out-1');
  assert.equal(migrated.outbox[0].retryState, 'RETRYABLE');
  assert.equal(migrated.outbox[0].record.title, 'Test');
});

test('existing outbox items with retryState are preserved', () => {
  const state = {
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    settings: { captureRoute: 'archive' },
    archive: [],
    outbox: [{ id: 'out-1', record: { title: 'a', canonicalUrl: '', capturedAt: '', mode: 'body', bodyText: 'x', bodySha256: 'y', truncated: false, delivery: { status: 'PENDING' }, projectId: 'unfiled', tags: [], note: '', screenshot: null }, error: 'x', createdAt: '2026-08-01T00:00:00.000Z', retryState: 'NEEDS_VERIFICATION' }],
    projects: [{ id: 'unfiled', name: 'Unfiled', createdAt: null }]
  };
  const migrated = migrateEvidenceState(state);
  assert.equal(migrated.outbox[0].retryState, 'NEEDS_VERIFICATION');
});

test('normalizes an already-schema-versioned state with captureRoute without duplicating the default project', () => {
  const current = {
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    settings: {}, archive: [], outbox: [],
    projects: [{ id: 'unfiled', name: 'Unfiled', createdAt: null }]
  };
  const migrated = migrateEvidenceState(current);
  assert.equal(migrated.schemaVersion, ARCHIVE_SCHEMA_VERSION);
  assert.equal(migrated.settings.captureRoute, 'archive');
  assert.deepEqual(migrated.projects, [{ id: 'unfiled', name: 'Unfiled', createdAt: null }]);
  assert.equal(migrated.projects.length, 1);
});

test('invalid persisted captureRoute in legacy state migrates to archive', () => {
  const legacy = {
    settings: { dataSourceId: 'target-1', titleProperty: 'Name', urlProperty: 'URL', captureRoute: 'unknown' },
    archive: [],
    outbox: []
  };
  const migrated = migrateEvidenceState(legacy);
  assert.equal(migrated.settings.captureRoute, 'archive');
  assert.equal(migrated.settings.dataSourceId, 'target-1');
});

test('invalid persisted captureRoute in schema-versioned state migrates to archive', () => {
  const state = {
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    settings: { dataSourceId: 'ds-1', captureRoute: 'invalid-value-999' },
    archive: [],
    outbox: [],
    projects: [{ id: 'unfiled', name: 'Unfiled', createdAt: null }]
  };
  const migrated = migrateEvidenceState(state);
  assert.equal(migrated.settings.captureRoute, 'archive');
  assert.equal(migrated.settings.dataSourceId, 'ds-1');
});

test('explicit archive captureRoute in schema-versioned state stays archive', () => {
  const state = {
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    settings: { dataSourceId: 'ds-1', captureRoute: 'archive' },
    archive: [],
    outbox: [],
    projects: [{ id: 'unfiled', name: 'Unfiled', createdAt: null }]
  };
  const migrated = migrateEvidenceState(state);
  assert.equal(migrated.settings.captureRoute, 'archive');
  assert.equal(migrated.settings.dataSourceId, 'ds-1');
});
