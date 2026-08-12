import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sourceRoot = new URL('../', import.meta.url);
const USER_FACING_FILES = [
  new URL('popup.html', sourceRoot),
  new URL('popup.js', sourceRoot),
  new URL('archive.html', sourceRoot),
  new URL('archive.js', sourceRoot),
  new URL('background.js', sourceRoot),
  new URL('core/capture-feedback.mjs', sourceRoot),
  new URL('core/page-cleaner.mjs', sourceRoot),
  new URL('README.md', sourceRoot),
  new URL('README.md', sourceRoot)
];

test('user-visible ProofClip copy contains no CJK characters', async () => {
  const violations = [];
  for (const file of USER_FACING_FILES) {
    const text = await readFile(file, 'utf8');
    const matches = text.match(/[\u4e00-\u9fff]/g);
    if (matches && matches.length) violations.push(`${file.pathname}: ${matches.length} CJK character(s)`);
  }
  assert.deepEqual(violations, []);
});
