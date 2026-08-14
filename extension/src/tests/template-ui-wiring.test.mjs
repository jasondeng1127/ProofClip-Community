import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('popup exposes template choice and renders schema-aware field mappings before saving', async () => {
  const [html, source] = await Promise.all([
    readFile(new URL('../popup.html', import.meta.url), 'utf8'),
    readFile(new URL('../popup.js', import.meta.url), 'utf8')
  ]);
  assert.match(html, /id="templateId"/);
  assert.match(html, /id="templateMappings"/);
  assert.match(html, /id="templateValidation"/);
  assert.match(source, /allTemplates/);
  assert.match(source, /validateTemplateMapping/);
  assert.match(source, /fieldMappings/);
  assert.match(source, /propertyTypes/);
  assert.match(html, /id="templateName"/);
  assert.match(html, /id="templateFields"/);
  assert.match(html, /id="newTemplate"/);
  assert.match(html, /id="editTemplate"/);
  assert.match(html, /id="addTemplateField"/);
  assert.match(html, /id="saveTemplate"/);
  assert.match(html, /id="deleteTemplate"/);
  assert.match(html, /id="setDefaultTemplate"/);
  assert.match(source, /allTemplates\(currentSettings\.userTemplates\)/);
  assert.match(source, /createUserTemplate/);
  assert.match(source, /validateUserTemplate/);
  assert.match(source, /removeUserTemplate/);
  assert.match(source, /SAVE_SETTINGS', settings: \{ userTemplates/);
  assert.match(source, /existing archived evidence cards are not affected/i);
  assert.match(source, /standardUserTemplateFields\(\)/);
  assert.match(source, /const isCore = field\.id === 'title' \|\| field\.id === 'url'/);
  assert.match(source, /required\.disabled = isCore/);
  assert.match(source, /remove\.disabled = isCore/);
});
