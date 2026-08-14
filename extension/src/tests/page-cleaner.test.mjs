import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { cleanPageBody, CONTENT_SELECTORS, EXCLUDED_SELECTORS } from '../core/page-cleaner.mjs';

// Minimal offline DOM stub: only the operations cleanPageBody uses
// (cloneNode, querySelectorAll, remove, innerText) with the simple selectors in
// CONTENT_SELECTORS / EXCLUDED_SELECTORS (tags, .class, #id, [attr="x"],
// [attr*="sub"]).
function element(tag, options = {}, children = []) {
  const node = {
    tag,
    id: options.id || '',
    className: options.className || '',
    role: options.role || '',
    extraAttrs: options.attrs || {},
    text: options.text || '',
    children,
    parent: null,
    cloneNode(deep) {
      const copy = element(tag, { id: this.id, className: this.className, role: this.role, attrs: { ...this.extraAttrs }, text: this.text }, deep ? this.children.map((child) => child.cloneNode(true)) : []);
      copy.parent = null;
      return copy;
    },
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
    },
    querySelectorAll(selector) { return queryAll(this, selector); },
    querySelector(selector) { return queryAll(this, selector)[0] || null; },
    get innerText() {
      if (this.text) return this.text;
      return this.children.map((child) => child.innerText).filter(Boolean).join('\n');
    }
  };
  for (const child of children) child.parent = node;
  return node;
}

function matches(node, token) {
  if (token.startsWith('.')) return String(node.className || '').split(/\s+/).includes(token.slice(1));
  if (token.startsWith('#')) return node.id === token.slice(1);
  if (token.startsWith('[')) {
    const parsed = /^\[([a-zA-Z-]+)(\*?=)"?([^"\]]*)"?\]$/.exec(token);
    if (!parsed) return false;
    const [, attr, operator, expected] = parsed;
    const value = attr === 'class' ? node.className : attr === 'id' ? node.id : attr === 'role' ? node.role : String(node.extraAttrs?.[attr] || '');
    return operator === '*=' ? String(value).includes(expected) : String(value) === expected;
  }
  return node.tag === token;
}

function queryAll(root, selector) {
  const tokens = String(selector).split(',').map((token) => token.trim()).filter(Boolean);
  const found = [];
  const walk = (node) => {
    for (const child of node.children || []) {
      if (tokens.some((token) => matches(child, token))) found.push(child);
      walk(child);
    }
  };
  walk(root);
  return found;
}

test('cleaning removes navigation, ads, comments, cookie banners and keeps the article body', () => {
  const page = element('body', {}, [
    element('header', { text: 'SITE HEADER' }),
    element('nav', { text: 'NAV LINKS' }),
    element('article', { className: 'post-layout' }, [
      element('div', { className: 'post-content', text: 'QUESTION BODY' }),
      element('div', { className: 'comments', text: 'COMMENT SECTION' }),
      element('div', { className: 'cookie-banner', text: 'WE USE COOKIES' }),
      element('aside', { className: 'sidebar', text: 'RELATED ADS' }),
      element('div', { className: 'ad-container', text: 'SPONSORED CARD' })
    ]),
    element('footer', { text: 'FOOTER' })
  ]);
  const text = cleanPageBody(page);
  assert.equal(text, 'QUESTION BODY');
});

test('GitHub markdown and Reddit-like containers are preferred and cleaned', () => {
  const github = element('body', {}, [
    element('nav', { text: 'REPO NAV' }),
    element('div', { className: 'markdown-body', text: 'README CONTENT' })
  ]);
  assert.equal(cleanPageBody(github), 'README CONTENT');

  const reddit = element('body', {}, [
    element('shreddit-post', {}, [
      element('div', { className: 'md', text: 'POST TEXT' }),
      element('div', { className: 'comment', text: 'COMMENT' })
    ])
  ]);
  assert.equal(cleanPageBody(reddit), 'POST TEXT');
});

test('a plain page with no matching rules keeps its full text', () => {
  const page = element('body', {}, [
    element('div', { text: 'PLAIN TEXT' }),
    element('p', { text: 'MORE PLAIN TEXT' })
  ]);
  assert.equal(cleanPageBody(page), 'PLAIN TEXT\nMORE PLAIN TEXT');
});

test('cleaning throws on a non-DOM root so callers can fall back to the original text', () => {
  assert.throws(() => cleanPageBody({}), /not a DOM node/);
  assert.throws(() => cleanPageBody(null), /not a DOM node/);
});

test('background embeds the same selector rules and falls back to raw innerText on error', async () => {
  const background = await readFile(new URL('../background.js', import.meta.url), 'utf8');
  assert.match(background, /import \{ EXCLUDED_SELECTORS, CONTENT_SELECTORS \} from '\.\/core\/page-cleaner\.mjs'/);
  assert.equal(background.split('args: [EXCLUDED_SELECTORS, CONTENT_SELECTORS]').length - 1, 4);
  assert.match(background, /bodyText = \(root\?\.innerText \|\| ''\)\.replace/);
  assert.match(background, /EXCLUDED_SELECTORS/);
  assert.match(background, /CONTENT_SELECTORS/);
});

test('selector lists cover the initial site adaptations and remain local-only', () => {
  assert.match(CONTENT_SELECTORS, /#mainbar/);
  assert.match(CONTENT_SELECTORS, /\.markdown-body/);
  assert.match(CONTENT_SELECTORS, /\.post-content/);
  assert.match(EXCLUDED_SELECTORS, /\.comments/);
  assert.match(EXCLUDED_SELECTORS, /\.cookie-banner/);
  assert.match(EXCLUDED_SELECTORS, /\.sidebar/);
  assert.match(EXCLUDED_SELECTORS, /\.ad\b/);
  assert.doesNotMatch(EXCLUDED_SELECTORS + CONTENT_SELECTORS, /fetch\(|XMLHttpRequest|https?:\/\//);
});
