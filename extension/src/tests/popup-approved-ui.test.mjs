import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../popup.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../popup.css', import.meta.url), 'utf8');
const popupJs = await readFile(new URL('../popup.js', import.meta.url), 'utf8');
const background = await readFile(new URL('../background.js', import.meta.url), 'utf8');

test('approved Popup shell keeps Capture first and places Outbox below recent capture', () => {
  for (const page of ['capture', 'archive', 'settings']) {
    assert.match(html, new RegExp(`data-page="${page}"`));
  }
  assert.match(html, /<strong>Selection<\/strong>/);
  assert.match(html, /<strong>Image area<\/strong>/);
  assert.match(html, /<strong>Full page<\/strong>/);
  assert.doesNotMatch(html, /Capture selection|Capture image area|Capture full page/);
  assert.doesNotMatch(html, /Save selected text|Drag to capture a visible area|Save the current page/);
  assert.match(html, /Alt\s*\+\s*1/);
  assert.match(html, /Alt\s*\+\s*2/);
  assert.match(html, /Alt\s*\+\s*3/);
  const recent = html.indexOf('id="recentCapture"');
  const outbox = html.indexOf('id="outbox"');
  assert.ok(recent >= 0 && outbox > recent, 'Outbox must follow recent capture in the Capture section');
});

test('approved Capture visual target uses illustrated actions and a real latest-capture preview', () => {
  assert.match(html, /class="capture-hero"/);
  assert.match(html, /assets\/capture-selection\.svg/);
  assert.match(html, /assets\/capture-region\.svg/);
  assert.match(html, /assets\/capture-page\.svg/);
  assert.match(html, /id="recentPreview"/);
  assert.match(html, /id="recentThumbnail"/);
  assert.match(html, /class="recent-header"/);
  assert.match(html, /class="outbox-title"/);
  assert.match(css, /\.recent-capture h3,\.outbox-card h3\s*\{[^}]*margin:0/);
  assert.match(css, /\.capture-hero\s*\{/);
  assert.match(css, /\.capture-hero h2\s*\{[^}]*font-size:\s*20px/);
  assert.match(css, /\.settings-hero > h2\s*\{[^}]*font-size:\s*20px/);
  assert.match(css, /\.capture-action > img\s*\{/);
  assert.doesNotMatch(css, /\.capture-action > img\s*\{[^}]*filter:/s);
  assert.match(css, /\.capture-action\s*\{[^}]*grid-template-columns:\s*36px minmax\(0,1fr\) max-content/s);
  assert.match(css, /\.capture-action strong\s*\{[^}]*white-space:\s*nowrap[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis/s);
  assert.match(css, /\.capture-action kbd\s*\{[^}]*white-space:\s*nowrap[^}]*justify-self:\s*end/s);
  assert.match(css, /\.recent-preview img\[hidden\],\.recent-placeholder\[hidden\]\s*\{\s*display:none/);
  assert.match(popupJs, /function renderRecentCapture\(record\)/);
  assert.match(background, /recentCapture:/);
});

test('approved Settings visual target keeps the complete Notion setup in matched connection and template cards', () => {
  assert.match(html, /class="settings-connection"[\s\S]*?id="connectionStatus"[\s\S]*?id="connectNotion"/);
  assert.match(html, /class="settings-target"[\s\S]*?id="dataSourceId"[\s\S]*?id="templateId"[\s\S]*?class="mapping-details"[\s\S]*?id="saveSettings"/);
  assert.match(html, /class="settings-template"[\s\S]*?<summary>[\s\S]*?Template editor[\s\S]*?id="templateName"[\s\S]*?id="setDefaultTemplate"/);
  assert.match(css, /\.settings-connection,\.settings-template\s*\{[^}]*border-radius:\s*12px/);
  assert.match(css, /\.mapping-details\s*\{[^}]*border:\s*2px solid #1557f5/);
  assert.match(css, /\.settings-target #saveSettings\s*\{[^}]*border-radius:\s*10px/);
});

test('Field mapping starts collapsed while retaining its editable controls', () => {
  const mapping = html.match(/<details class="mapping-details"([^>]*)>([\s\S]*?)<\/details>/);
  assert.ok(mapping, 'Field mapping must remain a native details disclosure');
  assert.doesNotMatch(mapping[1], /\bopen\b/, 'Field mapping must be collapsed until the user opens it');
  assert.match(mapping[2], /id="templateMappings"/, 'mapping field controls must remain inside the disclosure');
  assert.match(mapping[2], /id="templateValidation"/, 'mapping validation must remain inside the disclosure');
  assert.doesNotMatch(mapping[2], /id="saveSettings"/, 'Save target mapping must remain visible outside the disclosure');
  assert.match(html, /<\/details>\s*<button id="saveSettings" disabled>Save target mapping<\/button><p class="action-feedback" data-action-feedback="notion"/, 'the save action and feedback must follow Field mapping within Delivery target');
});

test('Settings uses one compact visual scale instead of oversized stacked panels', () => {
  assert.match(css, /\.settings-connection,\.settings-template\s*\{[^}]*margin-top:\s*8px[^}]*border-radius:\s*12px/);
  assert.match(css, /\.settings-connection\s*\{[^}]*gap:\s*8px[^}]*padding:\s*10px/);
  assert.match(css, /\.settings-connection h3,\.settings-target h3\s*\{[^}]*font-size:\s*14px/);
  assert.match(css, /\.settings-privacy\s*\{[^}]*margin:\s*6px 0 0[^}]*padding:\s*6px 8px[^}]*font-size:\s*10px/);
  assert.match(css, /\.settings-target\s*\{[^}]*margin-top:\s*8px[^}]*padding:\s*10px[^}]*border-radius:\s*12px/);
  assert.match(css, /\.mapping-details\s*\{[^}]*margin-top:\s*9px[^}]*border-radius:\s*12px/);
  assert.match(css, /\.settings-template > summary\s*\{[^}]*min-height:\s*46px[^}]*padding:\s*0 10px/);
});

test('Settings starts with the same calm blue title surface as Capture', () => {
  assert.match(html, /data-page="settings"[\s\S]*?<section class="settings-hero">[\s\S]*?<h2>Settings<\/h2>[\s\S]*?Configure Notion once/);
  assert.match(css, /\.settings-hero\s*\{[^}]*border:1px solid #d8e5ff[^}]*border-radius:14px[^}]*background:linear-gradient/);
  assert.match(css, /\.settings-hero > h2\s*\{[^}]*font-size:20px/);
});

test('Guide page provides a scalable set of collapsed feature entries', () => {
  assert.match(html, /data-page="guide">Guide<\/button>/);
  assert.match(html, /<section class="page" data-page="guide" hidden>/);
  assert.match(html, /class="feature-guide-hero"[\s\S]*?<h2>Feature guide<\/h2>/);
  assert.ok((html.match(/class="feature-guide-item"/g) || []).length >= 8, 'guide entries must remain scalable');
  assert.match(css, /\.feature-guide-hero\s*\{[^}]*linear-gradient/);
  assert.match(css, /\.feature-guide-item > summary/);
});

test('Guide explains recovery, bulk delivery, and explicit delivery boundaries', () => {
  for (const summary of [
    'Right-click selection',
    'Duplicate capture warning',
    'Outbox recovery',
    'Send filtered records',
    'Direct delivery'
  ]) {
    assert.match(html, new RegExp(`<summary>${summary}<\\/summary>`));
  }
});
