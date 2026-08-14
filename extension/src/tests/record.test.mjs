import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceRecord } from '../core/record.mjs';

const page = {
  title: 'Article',
  url: 'https://example.test/article',
  bodyText: 'Readable fallback',
  contentBlocksComplete: true,
  contentBlocks: [
    { type: 'heading_2', text: 'Price details' },
    { type: 'paragraph', text: 'See source', href: 'https://example.test/source' },
    { type: 'image', imageUrl: 'https://cdn.example.test/photo.png' }
  ]
};

test('body records retain valid structured content beside their text fallback', async () => {
  const record = await createEvidenceRecord(page, 'body');
  assert.equal(record.bodyText, 'Readable fallback');
  assert.deepEqual(record.contentBlocks, page.contentBlocks);
  assert.equal(record.contentBlocksComplete, true);
});

test('body records fail closed when their semantic completeness marker is absent or malformed', async () => {
  for (const contentBlocksComplete of [undefined, false, 'true', 1]) {
    const record = await createEvidenceRecord({ ...page, contentBlocksComplete }, 'body');
    assert.equal(record.contentBlocksComplete, false);
  }
});

test('selection records discard page structure even when the page supplied it', async () => {
  const record = await createEvidenceRecord({ ...page, selection: 'Quoted sentence' }, 'selection');
  assert.deepEqual(record.contentBlocks, []);
  assert.equal(record.contentBlocksComplete, false);
});

test('region records discard page structure even when the page supplied it', async () => {
  const record = await createEvidenceRecord(page, 'region');
  assert.deepEqual(record.contentBlocks, []);
  assert.equal(record.contentBlocksComplete, false);
});
