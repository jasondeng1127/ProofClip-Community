import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('the side panel is the interface and no capture-site permission flow exists', async () => {
  const [manifest, popup] = await Promise.all([
    readFile(new URL('../manifest.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../popup.js', import.meta.url), 'utf8')
  ]);
  assert.deepEqual(manifest.host_permissions, ['<all_urls>']);
  assert.doesNotMatch(popup, /CAPTURE_SITE_ORIGINS|ensureCaptureSiteAccess|chrome\.permissions\.request/);
});
