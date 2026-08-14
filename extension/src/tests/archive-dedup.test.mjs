import test from 'node:test';
import assert from 'node:assert/strict';
import { duplicateConfirmMessage, findRecentDuplicate, normalizeCaptureUrl } from '../core/archive-dedup.mjs';

test('normalizeCaptureUrl ignores hash, query and trailing slash and lowercases the host', () => {
  assert.equal(normalizeCaptureUrl('https://Example.com/Path/?a=1#frag'), 'https://example.com/path');
  assert.equal(normalizeCaptureUrl('https://example.com/'), 'https://example.com/');
  assert.equal(normalizeCaptureUrl('http://localhost:3000/docs/'), 'http://localhost:3000/docs');
  assert.equal(normalizeCaptureUrl(''), '');
  assert.equal(normalizeCaptureUrl('not a url'), 'not a url');
});

test('findRecentDuplicate returns null when the archive has no matching URL (first capture never prompts)', () => {
  const archive = [{ id: 'a', canonicalUrl: 'https://example.test/other', capturedAt: '2026-08-09T00:00:00.000Z' }];
  assert.equal(findRecentDuplicate([], 'https://example.test/page'), null);
  assert.equal(findRecentDuplicate(archive, 'https://example.test/page'), null);
  assert.equal(findRecentDuplicate(archive, ''), null);
  assert.equal(findRecentDuplicate(archive, 'not a url'), null);
});

test('findRecentDuplicate matches the normalized canonical URL and returns the most recent capture', () => {
  const archive = [
    { id: 'old', canonicalUrl: 'https://example.test/Page?x=1#a', capturedAt: '2026-08-08T00:00:00.000Z', title: 'Old' },
    { id: 'new', canonicalUrl: 'https://example.test/page/', capturedAt: '2026-08-09T00:00:00.000Z', title: 'New' },
    { id: 'other', canonicalUrl: 'https://other.test/page', capturedAt: '2026-08-10T00:00:00.000Z' }
  ];
  const match = findRecentDuplicate(archive, 'https://example.test/page');
  assert.equal(match.title, 'New');
  assert.equal(match.capturedAt, '2026-08-09T00:00:00.000Z');
});

test('findRecentDuplicate falls back to the record url when canonicalUrl is absent', () => {
  const archive = [{ id: 'legacy', url: 'https://legacy.test/path/', capturedAt: '2026-08-07T00:00:00.000Z' }];
  assert.equal(findRecentDuplicate(archive, 'https://legacy.test/path')?.capturedAt, '2026-08-07T00:00:00.000Z');
});

test('duplicateConfirmMessage is English and includes the previous capture time', () => {
  assert.match(duplicateConfirmMessage('2026-08-09T10:30:00.000Z'), /This page was already captured at .+\. Continue\?/);
  assert.match(duplicateConfirmMessage(null), /This page was already captured at an earlier time\. Continue\?/);
});
