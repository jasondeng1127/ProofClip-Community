import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceRecord, sha256 } from '../core/record.mjs';

test('a 50,000+ character page is saved in full without a truncation marker', async () => {
  const longBody = 'a'.repeat(50_001);
  const record = await createEvidenceRecord({ title: 'Long page', url: 'https://example.test/long', bodyText: longBody }, 'body');
  assert.equal(record.truncated, false);
  assert.equal(record.bodyText.length, 50_001);
  assert.equal(record.bodySha256, await sha256(longBody));
});

test('a page above the defensive 200,000-character ceiling truncates with a clear flag', async () => {
  const record = await createEvidenceRecord({ title: 'Huge page', url: 'https://example.test/huge', bodyText: 'a'.repeat(200_001) }, 'body');
  assert.equal(record.truncated, true);
  assert.equal(record.bodyText.length, 200_000);
});
