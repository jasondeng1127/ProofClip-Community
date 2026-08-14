import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('the side-panel shell keeps the rail, shortcuts, and Community navigation', async () => {
  const [css, html] = await Promise.all([
    readFile(new URL('../popup.css', import.meta.url), 'utf8'),
    readFile(new URL('../popup.html', import.meta.url), 'utf8')
  ]);
  assert.match(css, /\.side-rail\s*\{[^}]*min-height:\s*0[^}]*height:\s*100vh[^}]*align-self:\s*stretch[^}]*overflow:\s*hidden/);
  assert.match(css, /\.nav-item\s*>\s*span\s*\{[^}]*display:\s*block/);
  assert.doesNotMatch(css, /\.capture-action kbd\s*\{\s*display:\s*none/);
  for (const shortcut of ['Alt \\+ 1', 'Alt \\+ 2', 'Alt \\+ 3']) assert.match(html, new RegExp('<kbd>' + shortcut + '<\\/kbd>'));
  for (const page of ['capture', 'archive', 'settings', 'guide']) assert.match(html, new RegExp('data-page="' + page + '"'));
  assert.doesNotMatch(html, /data-page="subscription"/);
  assert.match(html, /id="privacyLink"/);
});

test('the Guide page groups features by the Community sections only', async () => {
  const html = await readFile(new URL('../popup.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /Details will be added here\./);
  for (const group of ['Capture', 'Archive', 'Settings']) {
    assert.match(html, new RegExp('class="feature-guide-group-title">' + group + '</h3>'));
  }
  assert.doesNotMatch(html, /feature-guide-group-title">Your plan/);
  assert.doesNotMatch(html, /feature-guide-group-title">Privacy/);
  assert.doesNotMatch(html, /<summary>Feature \d/);
  assert.match(html, /Alt\+3 = Body, Alt\+2 = Region, Alt\+1 = Selection/);
  assert.match(html, /full captured text stays in your local Archive/);
  assert.match(html, /instead of silently shortening the record/);
  assert.match(html, /saved in your browser \(IndexedDB\)/);
  assert.match(html, /deleting a project moves its cards to Unfiled/);
  assert.match(html, /Remove one local card and its paired Outbox item/);
  assert.match(html, /Export JSON is a read-only archive/);
  assert.match(html, /no token is stored in this extension/);
  assert.match(html, /Title and URL cannot be removed/);
  assert.match(html, /then select Set up ProofClip/);
  assert.match(html, /<details class="mapping-details">/);
  assert.ok((html.match(/class="feature-guide-item"/g) || []).length >= 12, 'the guide must stay extensible beyond a fixed count');
});

test('the Settings page keeps the one-flow Data Source setup and template controls', async () => {
  const html = await readFile(new URL('../popup.html', import.meta.url), 'utf8');
  for (const id of ['setupDataSource', 'saveSettings', 'dataSourceId', 'templateId', 'templateFields', 'templateMappings']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.doesNotMatch(html, /licenseCard|quotaBadge|manualSubscriptionNote/);
});
