import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNotionRedirectUri, normalizeHttpsOrigin, patchCommunityOrigin } from '../lib/origin.mjs';

test('normalizeHttpsOrigin lowercases a valid HTTPS origin', () => {
  assert.equal(normalizeHttpsOrigin('HTTPS://Worker.Example:8443'), 'https://worker.example:8443');
});

test('normalizeHttpsOrigin rejects HTTP origins', () => {
  assert.throws(() => normalizeHttpsOrigin('http://worker.example'), /HTTPS origin/i);
});

test('normalizeHttpsOrigin rejects paths, queries, fragments, and credentials', () => {
  for (const value of [
    'https://worker.example/v1',
    'https://worker.example/?debug=1',
    'https://worker.example/#fragment',
    'https://user:secret@worker.example'
  ]) {
    assert.throws(() => normalizeHttpsOrigin(value), /origin/i, value);
  }
});

test('normalizeHttpsOrigin removes one trailing slash', () => {
  assert.equal(normalizeHttpsOrigin('https://worker.example/'), 'https://worker.example');
});

test('buildNotionRedirectUri uses the exact callback path', () => {
  assert.equal(buildNotionRedirectUri('https://worker.example'), 'https://worker.example/v1/auth/notion/callback');
});

test('patchCommunityOrigin changes only the Community origin string', () => {
  const config = "// keep this comment\nexport const COMMUNITY_API_ORIGIN = 'https://replace-me.invalid';\nexport const OTHER = 'unchanged';\n";
  assert.equal(
    patchCommunityOrigin(config, 'https://Worker.Example/'),
    "// keep this comment\nexport const COMMUNITY_API_ORIGIN = 'https://worker.example';\nexport const OTHER = 'unchanged';\n"
  );
});

test('patchCommunityOrigin rejects non-HTTPS origins without changing config', () => {
  const config = "export const COMMUNITY_API_ORIGIN = 'https://replace-me.invalid';\n";
  assert.throws(() => patchCommunityOrigin(config, 'http://worker.example'), /HTTPS origin/i);
});
