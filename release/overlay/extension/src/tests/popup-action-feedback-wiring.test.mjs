import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('popup exposes capture, archive, notion and template feedback containers only', async () => {
  const html = await readFile(new URL('../popup.html', import.meta.url), 'utf8');
  for (const name of ['capture', 'archive', 'notion', 'template']) {
    assert.match(html, new RegExp('data-action-feedback="' + name + '"'));
  }
  assert.doesNotMatch(html, /data-action-feedback="license"/);
});

test('popup contains no commercial copy, keys, or contact identities', async () => {
  const [html, source] = await Promise.all([
    readFile(new URL('../popup.html', import.meta.url), 'utf8'),
    readFile(new URL('../popup.js', import.meta.url), 'utf8')
  ]);
  for (const token of ['Activate a key', 'support-issued key', 'Your plan', 'Bridge', 'bridge', 'subscription', 'gmail.com', 'qq.com', 'works left', '50 works']) {
    assert.ok(!html.includes(token) && !source.includes(token), token + ' must not appear');
  }
});

test('popup navigation shows the four Community pages and a deployer privacy link', async () => {
  const html = await readFile(new URL('../popup.html', import.meta.url), 'utf8');
  for (const page of ['capture', 'archive', 'settings', 'guide']) {
    assert.match(html, new RegExp('data-page="' + page + '"'));
  }
  assert.doesNotMatch(html, /data-page="subscription"/);
});
