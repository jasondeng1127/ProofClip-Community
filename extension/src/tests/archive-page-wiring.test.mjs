import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('popup opens a local archive page and archive page uses only local archive commands', async () => {
  const [popup, popupJs, archive, archiveJs, background] = await Promise.all([
    readFile(new URL('../popup.html', import.meta.url), 'utf8'),
    readFile(new URL('../popup.js', import.meta.url), 'utf8'),
    readFile(new URL('../archive.html', import.meta.url), 'utf8'),
    readFile(new URL('../archive.js', import.meta.url), 'utf8'),
    readFile(new URL('../background.js', import.meta.url), 'utf8')
  ]);
  assert.match(popup, /id="openArchive"/);
  assert.match(popupJs, /type: 'OPEN_ARCHIVE'/);
  assert.match(archive, /id="archiveSearch"/);
  assert.match(archive, /<header class="archive-hero">/);
  assert.match(archive, /id="newProject"/);
  assert.match(archive, /id="sendFilteredToNotion"/);
  assert.match(archive, /id="projectFeedback"/);
  assert.match(archive, /aria-live="polite"/);
  assert.match(archiveJs, /type: 'GET_ARCHIVE_STATE'/);
  assert.match(archiveJs, /type: 'UPDATE_CARD_METADATA'/);
  assert.match(background, /case 'SEND_ARCHIVE_CARD'/);
  assert.match(background, /deliveryPrerequisites/);
  assert.match(archiveJs, /setProjectFeedback/);
  assert.match(archiveJs, /Classification saved locally\./);
  assert.match(archiveJs, /classificationFeedbackByCardId/);
  assert.match(archiveJs, /className = 'action-feedback card-feedback'/);
  assert.match(archiveJs, /Saving classification/);
  assert.match(archiveJs, /My note \/ summary/);
  assert.match(archiveJs, /Send to Notion/);
  assert.match(archiveJs, /Remove local copy/);
  assert.match(archiveJs, /type: 'SEND_ARCHIVE_CARD'/);
  assert.match(archiveJs, /type: 'REMOVE_ARCHIVE_CARD'/);
  assert.match(archiveJs, /dataset\.cardId = card\.id/);
  assert.match(archiveJs, /focusCardFromUrl/);
  assert.match(await readFile(new URL('../archive.css', import.meta.url), 'utf8'), /\.archive-hero\s*\{[^}]*border:1px solid #d8e5ff[^}]*border-radius:16px[^}]*background:linear-gradient/s);
  assert.match(archiveJs, /URLSearchParams\(location\.search\)\.get\('focus'\)/);
  assert.match(archiveJs, /focus-highlight/);
  assert.match(archiveJs, /Text truncated at 200,000 characters/);
  assert.match(archiveJs, /const tags = \[\.\.\.new Set\(archiveState\.archive\.flatMap\(\(card\) => card\.tags \|\| \[\]\)\)\]\.sort\(\)/);
  assert.match(archiveJs, /tags\.value\.split\('\,'\)/);
  assert.match(archiveJs, /archiveState = result\.state; renderFilters\(\); renderCards\(\)/);
  assert.match(archiveJs, /Tags \(comma-separated\)/);
  assert.doesNotMatch(archiveJs, /\$\('#filterProject'\)\.value = result\.project\.id/);
  assert.doesNotMatch(archiveJs, /proofclipApi/);
  assert.match(archiveJs, /type: 'SEND_ARCHIVE_BATCH'/);
  assert.match(archiveJs, /Send filtered to Notion/);
  assert.doesNotMatch(archiveJs, /Send selected/);
  assert.doesNotMatch(archiveJs, /Ready to send/);
  assert.doesNotMatch(archiveJs, /auto-send/i);
  assert.doesNotMatch(archiveJs, /automatic send/i);
  assert.match(background, /case 'OPEN_ARCHIVE'/);
  assert.match(background, /case 'OPEN_ARCHIVE_CARD'/);
  assert.match(background, /case 'SEND_FROM_TOAST'/);
  assert.match(background, /case 'GET_ARCHIVE_STATE'/);
  assert.match(background, /case 'CREATE_PROJECT'/);
  assert.match(background, /case 'DELETE_PROJECT'/);
  assert.match(background, /case 'UPDATE_CARD_METADATA'/);
  assert.match(background, /case 'REMOVE_ARCHIVE_CARD'/);
});
