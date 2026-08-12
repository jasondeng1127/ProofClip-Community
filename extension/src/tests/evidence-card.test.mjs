import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEvidenceCard } from '../core/evidence-card.mjs';

test('normalizes V1 card metadata without modifying captured evidence', () => {
  const card = normalizeEvidenceCard({
    id: 'card-1',
    title: '  Acme Supplier  ',
    canonicalUrl: 'https://example.test/prices',
    capturedAt: '2026-07-30T04:00:00.000Z',
    mode: 'selection',
    bodyText: 'A quoted price',
    bodySha256: 'abc123',
    truncated: false,
    tags: [' Buyer ', 'buyer', '', 'Regulation'],
    note: '  Review this  ',
    delivery: { status: 'PENDING' }
  });

  assert.equal(card.projectId, 'unfiled');
  assert.deepEqual(card.tags, ['buyer', 'regulation']);
  assert.equal(card.note, 'Review this');
  assert.equal(card.screenshot, null);
  assert.equal(card.title, 'Acme Supplier');
  assert.equal(card.bodyText, 'A quoted price');
  assert.equal(card.delivery.status, 'PENDING');
});

test('rejects malformed regional screenshots instead of persisting unsafe image data', () => {
  assert.throws(() => normalizeEvidenceCard({
    id: 'card-2', title: 'Bad image', canonicalUrl: 'https://example.test', capturedAt: '2026-07-30T04:00:00.000Z',
    mode: 'region', bodyText: '', bodySha256: '', truncated: false, delivery: { status: 'PENDING' },
    screenshot: { mimeType: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,abc', width: 1, height: 1 }
  }), /PNG/);
});

test('notes preserve internal newlines while trimming surrounding whitespace', () => {
  const card = normalizeEvidenceCard({
    id: 'card-3', title: 'T', canonicalUrl: 'https://example.test', capturedAt: '2026-08-01T00:00:00Z',
    mode: 'body', bodyText: 'b', bodySha256: 'h', truncated: false,
    note: '  Line 1\nLine 2\n  Line 3  '
  });
  assert.equal(card.note, 'Line 1\nLine 2\n  Line 3');
});
