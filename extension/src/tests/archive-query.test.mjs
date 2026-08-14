import test from 'node:test';
import assert from 'node:assert/strict';
import { queryArchive } from '../core/archive-query.mjs';

const cards = [
  { id: 'old', title: 'Acme price sheet', canonicalUrl: 'https://example.test/acme', capturedAt: '2026-07-29T00:00:00.000Z', bodyText: 'MOQ 500', note: 'verify next week', projectId: 'buyers', tags: ['buyer'], mode: 'region', delivery: { status: 'SENT' } },
  { id: 'new', title: 'EU regulation update', canonicalUrl: 'https://example.test/eu', capturedAt: '2026-07-30T00:00:00.000Z', bodyText: 'compliance', note: '', projectId: 'rules', tags: ['regulation'], mode: 'body', delivery: { status: 'FAILED' } }
];

test('searches evidence across source, body, note and tags in newest-first order', () => {
  assert.deepEqual(queryArchive(cards, { text: 'example.test' }).map(({ id }) => id), ['new', 'old']);
  assert.deepEqual(queryArchive(cards, { text: 'verify' }).map(({ id }) => id), ['old']);
  assert.deepEqual(queryArchive(cards, { text: 'buyer' }).map(({ id }) => id), ['old']);
});

test('filters evidence by project, tag, capture mode and delivery state together', () => {
  assert.deepEqual(queryArchive(cards, { projectId: 'buyers', tag: 'buyer', captureMode: 'region', deliveryStatus: 'SENT' }).map(({ id }) => id), ['old']);
  assert.deepEqual(queryArchive(cards, { projectId: 'buyers', deliveryStatus: 'FAILED' }), []);
});
