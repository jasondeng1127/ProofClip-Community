import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('manifest is a minimal Manifest V3 extension', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, '0.7.0');
  assert.equal(manifest.key, undefined);
  assert.deepEqual(manifest.permissions, ['activeTab', 'contextMenus', 'scripting', 'storage', 'downloads', 'sidePanel']);
  assert.equal(manifest.minimum_chrome_version, '141');
  assert.equal(manifest.side_panel.default_path, 'popup.html');
  assert.equal(manifest.action.default_popup, undefined);
  assert.deepEqual(manifest.host_permissions, ['<all_urls>']);
  assert.equal(manifest.optional_host_permissions, undefined);
  assert.deepEqual(Object.keys(manifest.commands || {}).sort(), ['proofclip-capture-body', 'proofclip-capture-region', 'proofclip-capture-selection']);
  assert.equal(manifest.commands['proofclip-capture-body'].suggested_key.default, 'Alt+3');
  assert.equal(manifest.commands['proofclip-capture-selection'].suggested_key.default, 'Alt+1');
  assert.equal(manifest.commands['proofclip-capture-region'].suggested_key.default, 'Alt+2');
  assert.equal(manifest.commands['proofclip-capture-body'].description, 'Capture page body');
  assert.equal(manifest.commands['proofclip-capture-selection'].description, 'Capture selection');
  assert.equal(manifest.commands['proofclip-capture-region'].description, 'Capture region');
  assert.equal(manifest.icons['128'], 'assets/icon-128.png');
  assert.equal(manifest.action.default_icon['16'], 'assets/icon-16.png');
  assert.equal(manifest.background.type, 'module');
});
