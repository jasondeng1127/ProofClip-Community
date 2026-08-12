import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const background = await readFile(new URL('../background.js', import.meta.url), 'utf8');
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');

test('commands map to the three capture modes and reuse the current capture route', () => {
  assert.match(background, /chrome\.commands\.onCommand\.addListener/);
  assert.match(background, /command === 'proofclip-capture-body'/);
  assert.match(background, /command === 'proofclip-capture-selection'/);
  assert.match(background, /command === 'proofclip-capture-region'/);
  assert.match(background, /normalizeCaptureRoute\(commandState\.settings\.captureRoute\)/);
  assert.match(background, /captureDirect\('body'\)/);
  assert.match(background, /captureLocal\('body'\)/);
  assert.match(background, /captureSelectionFromContext\(tab\.id, selectionText\)/);
  assert.match(background, /captureRegionPreview\(\)/);
});

test('shortcut selection requires a non-empty page selection', () => {
  assert.match(background, /window\.getSelection\(\)\?\.toString/);
  assert.match(background, /select text on the page first\./);
});

test('README documents the shortcut table', () => {
  assert.match(readme, /`Alt\+3` \| Capture page body/);
  assert.match(readme, /`Alt\+2` \| Capture region/);
  assert.match(readme, /`Alt\+1` \| Capture selection/);
});
