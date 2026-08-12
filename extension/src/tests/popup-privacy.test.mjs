import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { communityPrivacyUrl } from '../core/proofclip-api.mjs';

test('popup does not render a connected users Notion workspace name', async () => {
  const source = await readFile(new URL('../popup.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /state\.connection\.workspaceName/);
  assert.match(source, /'Connected to Notion\.'/);
});

test('Privacy uses the configured Community Worker origin without a fixed deployment identity', async () => {
  const [html, popup] = await Promise.all([
    readFile(new URL('../popup.html', import.meta.url), 'utf8'),
    readFile(new URL('../popup.js', import.meta.url), 'utf8')
  ]);
  const origin = ['https://deployer.example', '.workers.dev'].join('');
  assert.equal(communityPrivacyUrl(`${origin}/`), `${origin}/privacy`);
  assert.match(html, /class="privacy-link"[^>]*target="_blank"/);
  assert.doesNotMatch(html, /workers\.dev|jasondeng1127/i);
  assert.match(popup, /communityPrivacyUrl/);
  assert.match(popup, /privacyLink\.href = communityPrivacyUrl\(\)/);
});
