import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const [html, source, css] = await Promise.all([
  readFile(new URL('../archive.html', import.meta.url), 'utf8'),
  readFile(new URL('../archive.js', import.meta.url), 'utf8'),
  readFile(new URL('../archive.css', import.meta.url), 'utf8')
]);

test('Archive separates compact rows from a read-only full-text reader', () => {
  assert.match(html, /id="cards" class="archive-list"/);
  assert.match(html, /id="reader"/);
  assert.match(html, /id="readerText"/);
  assert.match(html, /id="openFullReader"/);
  assert.match(source, /function selectCard\(card\)/);
  assert.match(html, /Original evidence — read only/);
  assert.match(html, /View full text/);
});

test('Archive renders the same structured text and image blocks that are sent to Notion', () => {
  assert.match(source, /function renderStructuredEvidence\(container, card\)/);
  assert.match(source, /block\?\.type === 'image'/);
  assert.match(source, /document\.createElement\('img'\)/);
  assert.match(source, /renderStructuredEvidence\(\$\('#readerText'\), card\)/);
  assert.match(source, /\$\('#fullReaderText'\)\.replaceChildren/);
  assert.match(css, /\.evidence-image\s*\{[^}]*max-width:\s*100%/);
});

test('Archive renders structured blocks only for records proven complete', () => {
  assert.match(source, /card\.contentBlocksComplete === true/);
});

test('desktop archive keeps the evidence list inside its own scroll area instead of scrolling the browser page', () => {
  assert.match(css, /body\s*\{[^}]*overflow:\s*hidden/);
  assert.match(css, /main\s*\{[^}]*height:\s*100vh[^}]*grid-template-rows:[^}]*minmax\(0,1fr\)/);
  assert.match(css, /\.archive-workspace\s*\{[^}]*min-height:\s*0/);
  assert.match(css, /\.archive-list\s*\{[^}]*overflow-y:\s*auto[^}]*overscroll-behavior:\s*contain/);
  assert.match(css, /@media \(max-width:800px\)[^]*?body\s*\{[^}]*overflow:\s*auto/);
});

test('archive uses one compact tools band above two full-height evidence panes', () => {
  assert.match(html, /<section class="panel archive-tools">[\s\S]*?<div class="controls">[\s\S]*?id="newProject"[\s\S]*?<\/section>\s*<section class="archive-workspace">/);
  assert.doesNotMatch(html, /<section class="panel controls">/);
  assert.match(css, /main\s*\{[^}]*grid-template-rows:\s*auto auto auto minmax\(0,1fr\)/);
  assert.match(css, /\.archive-tools\s*\{[^}]*margin-top:\s*14px/);
  assert.match(css, /\.archive-workspace\s*\{[^}]*grid-template-columns:\s*minmax\(300px,\.8fr\) minmax\(400px,1\.2fr\)/);
});
