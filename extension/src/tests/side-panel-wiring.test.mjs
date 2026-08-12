import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('ProofClip opens its existing interface as a full-height Side Panel instead of an Action Popup', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  const background = await readFile(new URL('../background.js', import.meta.url), 'utf8');

  assert.ok(manifest.permissions.includes('sidePanel'));
  assert.equal(manifest.side_panel?.default_path, 'popup.html');
  assert.equal(manifest.action?.default_popup, undefined);
  assert.match(background, /chrome\.sidePanel\.setPanelBehavior\(\{ openPanelOnActionClick: true \}\)/);
});

test('the Side Panel capture handoff stays open while the shared main column owns scrolling', async () => {
  const [css, popup] = await Promise.all([
    readFile(new URL('../popup.css', import.meta.url), 'utf8'),
    readFile(new URL('../popup.js', import.meta.url), 'utf8')
  ]);

  assert.match(css, /html,body\s*\{[^}]*height:\s*100%[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.app-shell\s*\{[^}]*height:\s*100vh[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.side-rail\s*\{[^}]*height:\s*100vh[^}]*overflow:\s*hidden/s);
  assert.match(css, /main\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto[^}]*overscroll-behavior:\s*contain/s);
  assert.doesNotMatch(css, /height:\s*720px/);
  assert.doesNotMatch(popup, /closeForCapture|sendCaptureAndClose/);
  assert.match(popup, /action: \(\) => send\(\{ type: 'CAPTURE_WITH_ROUTE'/);
});

test('the Side Panel fits a narrow browser rail without clipping its capture controls', async () => {
  const css = await readFile(new URL('../popup.css', import.meta.url), 'utf8');

  assert.match(css, /body\s*\{[^}]*min-width:\s*0/);
  assert.match(css, /\.app-shell\s*\{[^}]*grid-template-columns:\s*69px minmax\(0, 1fr\)/);
  assert.match(css, /main\s*\{[^}]*min-width:\s*0/);
  assert.match(css, /\.capture-action\s*\{[^}]*box-sizing:\s*border-box/);
  assert.match(css, /\.app-header h1\s*\{[^}]*font-size:\s*20px/);
  assert.match(css, /\.page > h2\s*\{[^}]*font-size:\s*22px/);
});

test('the compact pass reduces all panel type and boxes by two pixels and narrows navigation by one fifth', async () => {
  const css = await readFile(new URL('../popup.css', import.meta.url), 'utf8');

  assert.match(css, /Approved v0\.7 side-panel shell[^]*?:root\s*\{[^}]*font:\s*12px\/1\.5/);
  assert.match(css, /\.app-shell\s*\{[^}]*grid-template-columns:\s*69px minmax\(0, 1fr\)/);
  assert.match(css, /\.app-header h1\s*\{[^}]*font-size:\s*20px/);
  assert.match(css, /\.page > h2\s*\{[^}]*font-size:\s*22px/);
  assert.match(css, /\.capture-action\s*\{[^}]*padding:\s*12px/);
  assert.match(css, /\.card,\.compact-card\s*\{[^}]*border-radius:\s*12px/);
});

test('the narrow rail stays fixed to the shell height and keeps all capture shortcuts visible', async () => {
  const [css, html] = await Promise.all([
    readFile(new URL('../popup.css', import.meta.url), 'utf8'),
    readFile(new URL('../popup.html', import.meta.url), 'utf8')
  ]);

  assert.match(css, /\.side-rail\s*\{[^}]*min-height:\s*0[^}]*height:\s*100vh[^}]*align-self:\s*stretch[^}]*overflow:\s*hidden/);
  assert.match(css, /\.nav-item\s*>\s*span\s*\{[^}]*display:\s*block/);
  assert.doesNotMatch(css, /\.capture-action kbd\s*\{\s*display:\s*none/);
  for (const shortcut of ['Alt \\+ 1', 'Alt \\+ 2', 'Alt \\+ 3']) assert.match(html, new RegExp(`<kbd>${shortcut}<\\/kbd>`));
});

test('the requested contextual copy, section titles, and field labels remain one size larger than compact controls', async () => {
  const css = await readFile(new URL('../popup.css', import.meta.url), 'utf8');

  assert.match(css, /\.app-header p\s*\{[^}]*font-size:\s*11px/);
  assert.match(css, /\.page-intro\s*\{[^}]*font-size:\s*13px/);
  assert.match(css, /\.card h3\s*\{[^}]*font-size:\s*14px/);
  assert.match(css, /\.hint\s*\{[^}]*font-size:\s*13px/);
  assert.match(css, /main label\s*\{[^}]*font-size:\s*13px/);
  assert.match(css, /details\.card > summary,details\.subdetails > summary\s*\{[^}]*font-size:\s*13px/);
});

test('navigation labels use a clear bold weight without commercial copy', async () => {
  const [css, html] = await Promise.all([
    readFile(new URL('../popup.css', import.meta.url), 'utf8'),
    readFile(new URL('../popup.html', import.meta.url), 'utf8')
  ]);

  assert.match(css, /\.nav-item\s*\{[^}]*font-weight:\s*700/);
  assert.doesNotMatch(html, /subscription|license|bridge key/i);
});

test('the Guide page groups features by navigation section with per-group numbering', async () => {
  const html = await readFile(new URL('../popup.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /Details will be added here\./);
  for (const group of ['Capture', 'Archive', 'Settings']) {
    assert.match(html, new RegExp(`class="feature-guide-group-title">${group}</h3>`));
  }
  assert.doesNotMatch(html, /feature-guide-group-title">Privacy/);
  assert.doesNotMatch(html, /<summary>Feature \d/);
  assert.match(html, /Alt\+3 = Body, Alt\+2 = Region, Alt\+1 = Selection/);
  assert.match(html, /200,000 characters are saved in full/);
  assert.match(html, /Right-click cancels a selection, just like Esc/);
  assert.match(html, /saved in your browser \(IndexedDB\)/);
  assert.match(html, /deleting a project moves its cards to Unfiled/);
  assert.match(html, /page toast offers Edit \(opens that card in Archive\) and Send to Notion/);
  assert.match(html, /Remove one local card and its paired Outbox item/);
  assert.match(html, /Export JSON is a read-only archive/);
  assert.match(html, /no token is stored in this extension/);
  assert.match(html, /Title and URL cannot be removed/);
  assert.match(html, /Mapping options come from the properties that already exist in your Notion Data Source/);
  assert.match(html, /create matching properties in Notion first/);
  assert.match(html, /<details class="mapping-details">/);
  assert.ok((html.match(/class="feature-guide-item"/g) || []).length >= 12, 'the guide must stay extensible beyond a fixed count');
});
