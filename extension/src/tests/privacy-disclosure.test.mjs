import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('popup keeps deployer-configured privacy, read-only, and non-restorable disclosures', async () => {
  const [popup, popupJs] = await Promise.all([
    readFile(new URL('../popup.html', import.meta.url), 'utf8'),
    readFile(new URL('../popup.js', import.meta.url), 'utf8')
  ]);
  assert.doesNotMatch(popup, /Free plan allows 5 works per day/);
  assert.doesNotMatch(popupJs, /Free plan allows 5 works per day/);
  assert.doesNotMatch(popup, /Evidence stays in this browser when you capture\./);
  assert.match(popup, /class="privacy-link"/);
  assert.doesNotMatch(popup, /workers\.dev|jasondeng1127/i);
  assert.match(popupJs, /privacyLink\.href = communityPrivacyUrl\(\)/);
  assert.match(popup, /read-only archive/i);
  assert.match(popup, /cannot restore/i);
});

test('archive remains the default capture route', async () => {
  const [popup, popupJs] = await Promise.all([
    readFile(new URL('../popup.html', import.meta.url), 'utf8'),
    readFile(new URL('../popup.js', import.meta.url), 'utf8')
  ]);
  // Archive is the default: the <select> lists archive before direct and popup.js falls back to archive.
  const archiveIdx = popup.indexOf('value="archive"');
  const directIdx = popup.indexOf('value="direct"');
  assert.ok(archiveIdx >= 0, 'archive select option missing');
  assert.ok(directIdx >= 0, 'direct select option missing');
  assert.ok(archiveIdx < directIdx, 'archive option must appear before direct option (default)');
  assert.match(popupJs, /captureRoute\s*\|\|\s*'archive'/);
});
