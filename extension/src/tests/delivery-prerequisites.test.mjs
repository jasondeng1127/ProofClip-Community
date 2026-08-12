import assert from 'node:assert/strict';
import test from 'node:test';
import { deliveryPrerequisites } from '../core/delivery-prerequisites.mjs';

test('delivery prerequisites block a missing target before a provider request', () => {
  assert.deepEqual(
    deliveryPrerequisites({ entitlement: { entitled: true }, connection: { connected: true }, settings: { dataSourceId: '' } }),
    { ok: false, error: 'Choose and save a Notion Data Source before sending.' }
  );
});

test('delivery prerequisites block a missing required evidence mapping', () => {
  assert.deepEqual(
    deliveryPrerequisites({ entitlement: { entitled: true }, connection: { connected: true }, settings: { dataSourceId: 'source-1', fieldMappings: { title: 'Name' } } }),
    { ok: false, error: 'Save valid Title and URL mappings before sending.' }
  );
});

test('delivery prerequisites block incompatible required mapping types before delivery', () => {
  assert.deepEqual(
    deliveryPrerequisites({
      entitlement: { entitled: true }, connection: { connected: true },
      settings: { dataSourceId: 'source-1', fieldMappings: { title: 'Name', url: 'URL' }, propertyTypes: { title: 'url', url: 'url' } }
    }),
    { ok: false, error: 'Save valid Title and URL mappings before sending.' }
  );
});

test('delivery prerequisites admit an entitled connected mapped target', () => {
  assert.deepEqual(
    deliveryPrerequisites({ entitlement: { entitled: true }, connection: { connected: true }, settings: { dataSourceId: 'source-1', fieldMappings: { title: 'Name', url: 'URL' }, propertyTypes: { title: 'title', url: 'url' } } }),
    { ok: true }
  );
});

test('custom templates pass delivery preflight when title and url are mapped (Bug E)', () => {
  assert.deepEqual(
    deliveryPrerequisites({
      entitlement: { entitled: true }, connection: { connected: true },
      settings: { dataSourceId: 'source-1', fieldMappings: { title: 'Name', url: 'URL', note: 'Note' }, propertyTypes: { title: 'title', url: 'url', note: 'rich_text' } }
    }),
    { ok: true }
  );
});

test('delivery preflight blocks an unmapped required custom field', () => {
  assert.deepEqual(
    deliveryPrerequisites({
      entitlement: { entitled: true }, connection: { connected: true },
      settings: {
        dataSourceId: 'source-1',
        fieldMappings: { title: 'Name', url: 'URL' },
        propertyTypes: { title: 'title', url: 'url' },
        templateFields: [
          { id: 'title', label: 'Title', required: true, types: ['title'], valueSource: 'title' },
          { id: 'url', label: 'URL', required: true, types: ['url'], valueSource: 'url' },
          { id: 'quote-text', label: 'Quote text', required: true, types: ['rich_text'], valueSource: 'bodyText' }
        ]
      }
    }),
    { ok: false, error: 'Save valid mappings for all required template fields before sending.' }
  );
});
