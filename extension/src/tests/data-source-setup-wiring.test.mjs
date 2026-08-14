import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../popup.html', import.meta.url), 'utf8');
const popup = await readFile(new URL('../popup.js', import.meta.url), 'utf8');
const background = await readFile(new URL('../background.js', import.meta.url), 'utf8');

test('one-click setup stays disabled until Notion is connected and a Data Source is selected', () => {
  assert.match(html, /<button id="setupDataSource" disabled>Set up ProofClip<\/button>/);
  assert.match(popup, /\$\('#setupDataSource'\)\.disabled = !eligible;/);
  assert.match(popup, /const eligible = canSaveTargetMapping\(notionConnected, \$\('#dataSourceId'\)\.value\);/);
});

test('popup sends the selected Data Source to the explicit setup route and rerenders returned settings', () => {
  assert.match(popup, /const setupDataSourceButton = \$\('#setupDataSource'\);[\s\S]*?runButtonAction\([\s\S]*?button: setupDataSourceButton[\s\S]*?type: 'SETUP_DATA_SOURCE',[\s\S]*?dataSourceId[\s\S]*?currentSettings = result\.settings[\s\S]*?renderTemplateMappings\(\)/);
  assert.match(popup, /successText: 'ProofClip is ready for this Data Source\.'/);
});

test('background persists setup settings only after the Worker setup response succeeds', () => {
  const route = background.match(/case 'SETUP_DATA_SOURCE': \{([\s\S]*?)\n      \}/)?.[1] || '';
  assert.match(route, /await proofclipApi\('\/v1\/data-sources\/setup', \{ storage: chrome\.storage\.local, method: 'POST', body: \{ dataSourceId: message\.dataSourceId \} \}\)/);
  const apiCall = route.indexOf("await proofclipApi('/v1/data-sources/setup'");
  const mutation = route.indexOf('await mutateState');
  assert.ok(apiCall >= 0 && mutation > apiCall, 'settings must not be mutated before setup succeeds');
  assert.match(route, /fresh\.settings = mergeSetupSettings\(fresh\.settings, result\.settings\);/);
  assert.doesNotMatch(route, /state\.settings = result\.settings|await saveState\(state\)/, 'setup must not replace settings or bypass the mutation queue');
});
