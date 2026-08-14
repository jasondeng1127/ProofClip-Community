import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeSettings } from '../core/storage.mjs';

test('preserves a structured template mapping while compacting mapped property names', () => {
  const settings = mergeSettings(
    { dataSourceId: 'source-1', titleProperty: 'Name', urlProperty: 'URL' },
    {
      templateId: 'buyer-account',
      fieldMappings: { title: '  Name  ', url: ' URL ', tags: '  Tags  ' },
      propertyTypes: { title: 'title', url: 'url', tags: 'multi_select' }
    }
  );
  assert.equal(settings.templateId, 'buyer-account');
  assert.deepEqual(settings.fieldMappings, { title: 'Name', url: 'URL', tags: 'Tags' });
  assert.deepEqual(settings.propertyTypes, { title: 'title', url: 'url', tags: 'multi_select' });
  assert.equal(settings.titleProperty, 'Name');
  assert.equal(settings.urlProperty, 'URL');
});

test('user templates persist through mergeSettings with normalization', () => {
  const settings = mergeSettings({ dataSourceId: 'source-1' }, {
    userTemplates: [
      { id: 'user-a', name: '  Research  ', fields: [{ id: 'title', label: 'Name', required: true, types: ['title'] }] },
      { id: 'user-bad', name: '', fields: [] }
    ]
  });
  assert.equal(settings.userTemplates.length, 1);
  assert.equal(settings.userTemplates[0].id, 'user-a');
  assert.equal(settings.userTemplates[0].name, 'Research');
  assert.equal(settings.userTemplates[0].fields[0].types[0], 'title');
});
