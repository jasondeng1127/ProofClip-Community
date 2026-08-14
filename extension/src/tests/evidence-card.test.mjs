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
  assert.equal(card.contentBlocksComplete, false);
});

test('preserves only an explicit complete marker for body semantic blocks', () => {
  const base = {
    id: 'card-completeness', title: 'T', canonicalUrl: 'https://example.test', capturedAt: '2026-08-01T00:00:00Z',
    mode: 'body', bodyText: 'full canonical text', bodySha256: 'h', truncated: false,
    contentBlocks: [{ type: 'paragraph', text: 'Structured text' }]
  };
  assert.equal(normalizeEvidenceCard({ ...base, contentBlocksComplete: true }).contentBlocksComplete, true);
  for (const contentBlocksComplete of [undefined, false, 'true', 1]) {
    assert.equal(normalizeEvidenceCard({ ...base, contentBlocksComplete }).contentBlocksComplete, false);
  }
});

test('normalizes persisted structured content without dropping text and limits images to 12', () => {
  const card = normalizeEvidenceCard({
    id: 'card-4', title: 'Bounded', canonicalUrl: 'https://example.test', capturedAt: '2026-08-09T00:00:00Z',
    mode: 'body', bodyText: 'Fallback', bodySha256: 'hash', truncated: false,
    contentBlocks: [
      ...Array.from({ length: 13 }, (_, index) => ({ type: 'image', imageUrl: `https://cdn.example.test/${index + 1}.png` })),
      ...Array.from({ length: 401 }, (_, index) => ({ type: 'paragraph', text: `Paragraph ${index + 1}` }))
    ]
  });
  assert.equal(card.contentBlocks.length, 413);
  assert.equal(card.contentBlocks.filter((block) => block.type === 'image').length, 12);
  assert.equal(card.contentBlocks.filter((block) => block.type === 'paragraph').length, 401);
});

test('preserves every structured block from a complete long-page capture', () => {
  const card = normalizeEvidenceCard({
    id: 'card-long-page', title: 'Long page', canonicalUrl: 'https://example.test/long', capturedAt: '2026-08-12T00:00:00Z',
    mode: 'body', bodyText: 'Full canonical fallback', bodySha256: 'hash', truncated: false, contentBlocksComplete: true,
    contentBlocks: Array.from({ length: 401 }, (_, index) => ({ type: 'paragraph', text: `Paragraph ${index + 1}` }))
  });
  assert.equal(card.contentBlocksComplete, true);
  assert.equal(card.contentBlocks.length, 401);
  assert.equal(card.contentBlocks.at(-1)?.text, 'Paragraph 401');
});
