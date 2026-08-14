import test from 'node:test';
import assert from 'node:assert/strict';
import { allTemplates, createUserTemplate, editableTemplateDraft, normalizeUserTemplates, removeUserTemplate, starterTemplates, validateTemplateMapping, validateUserTemplate } from '../core/evidence-templates.mjs';

const schema = [
  { name: 'Name', type: 'title' }, { name: 'URL', type: 'url' }, { name: 'Captured', type: 'date' },
  { name: 'Project', type: 'rich_text' }, { name: 'Tags', type: 'multi_select' }, { name: 'Note', type: 'rich_text' },
  { name: 'Evidence type', type: 'select' }, { name: 'Delivery', type: 'status' }, { name: 'Image', type: 'files' }
];

test('ships four independent editable starter templates', () => {
  const templates = starterTemplates();
  assert.deepEqual(templates.map(({ id }) => id), ['buyer-account', 'competitor', 'regulation', 'quote-evidence']);
  templates[0].name = 'changed';
  assert.equal(starterTemplates()[0].name, 'Buyer account');
});

test('accepts a complete mapping with compatible Notion property types', () => {
  const template = starterTemplates()[0];
  const result = validateTemplateMapping(template, schema, {
    title: 'Name', url: 'URL', capturedAt: 'Captured', project: 'Project', tags: 'Tags', note: 'Note', evidenceType: 'Evidence type', deliveryStatus: 'Delivery', screenshot: 'Image'
  });
  assert.deepEqual(result, { valid: true, errors: [], unsupportedFields: [] });
});

test('rejects missing required and incompatible mapped properties before delivery', () => {
  const template = starterTemplates()[0];
  const result = validateTemplateMapping(template, schema, { title: 'Name', url: 'Name', project: 'Missing' });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /URL/);
  assert.match(result.errors.join('\n'), /Missing/);
  assert.deepEqual(result.unsupportedFields, ['capturedAt', 'tags', 'note', 'evidenceType', 'deliveryStatus', 'screenshot']);
});

test('users can create templates with type-constrained fields and update them', () => {
  const template = createUserTemplate({
    name: '  Supplier quote  ',
    fields: [
      { id: 'title', label: 'Name', required: true, types: ['title'] },
      { id: 'quote', label: 'Quote text', required: true, types: ['rich_text'] },
      { id: 'image', label: 'Quote image', required: false, types: ['files'] },
      { id: 'bad', label: 'Bad type', required: false, types: ['notion_magic'] }
    ]
  }, 'user-supplier');
  assert.equal(template.id, 'user-supplier');
  assert.equal(template.name, 'Supplier quote');
  assert.deepEqual(template.fields.map((field) => field.id), ['title', 'quote', 'image', 'url']);
  assert.deepEqual(template.fields[0].types, ['title']);
  assert.equal(template.fields[1].required, true);
  assert.equal(template.fields.find((field) => field.id === 'url').required, true);
  assert.deepEqual(validateUserTemplate(template), { valid: true, errors: [] });
  const updated = createUserTemplate({ name: template.name, fields: template.fields }, template.id);
  updated.fields.push({ id: 'note', label: 'Note', required: false, types: ['rich_text'] });
  assert.equal(normalizeUserTemplates([updated])[0].fields.length, 5);
});

test('editing a starter template creates an independent custom copy instead of shadowing the built-in', () => {
  const draft = editableTemplateDraft(starterTemplates()[0]);
  assert.match(draft.id, /^user-/);
  assert.equal(draft.name, 'Buyer account copy');
  draft.fields[2].label = 'Captured on';
  assert.equal(starterTemplates()[0].fields[2].label, 'Captured time');
});

test('a custom template field stores a concrete capture value source for delivery', () => {
  const template = createUserTemplate({
    name: 'Quote review',
    fields: [{ id: 'quote-text', label: 'Quote text', required: true, valueSource: 'bodyText', types: ['rich_text'] }]
  }, 'user-quote-review');
  const quote = template.fields.find((field) => field.id === 'quote-text');
  assert.equal(quote.valueSource, 'bodyText');
  assert.deepEqual(quote.types, ['rich_text']);
});

test('user templates are rejected for missing names and normalized with the standard core fields', () => {
  assert.equal(validateUserTemplate(createUserTemplate({ name: '', fields: [] })).valid, false);
  const fresh = createUserTemplate({ name: 'X', fields: [] });
  assert.equal(validateUserTemplate(fresh).valid, true);
  assert.deepEqual(fresh.fields.map((field) => field.id), ['title', 'url', 'capturedAt', 'project', 'tags', 'note', 'evidenceType', 'deliveryStatus', 'screenshot']);
  assert.equal(fresh.fields.find((field) => field.id === 'title').required, true);
  assert.equal(fresh.fields.find((field) => field.id === 'url').required, true);
  const unknownTypes = { name: 'X', fields: [{ label: 'F', types: ['unknown'] }] };
  const mixedTypes = { name: 'Y', fields: [{ label: 'F', types: ['title', 'unknown'] }] };
  const repaired = normalizeUserTemplates([unknownTypes])[0];
  assert.equal(repaired.fields.some((field) => field.id === 'title'), true);
  assert.equal(repaired.fields.some((field) => field.id === 'url'), true);
  assert.equal(repaired.fields.some((field) => field.label === 'F'), false);
  assert.deepEqual(normalizeUserTemplates([mixedTypes])[0].fields.find((field) => field.label === 'F').types, ['title']);
});

test('built-in templates stay fully compatible and user templates append after them', () => {
  const custom = createUserTemplate({ name: 'Research', fields: [{ id: 'title', label: 'Name', required: true, types: ['title'] }] }, 'user-research');
  const all = allTemplates([custom]);
  assert.deepEqual(all.map((template) => template.id), ['buyer-account', 'competitor', 'regulation', 'quote-evidence', 'user-research']);
  assert.deepEqual(all[0].fields.map((field) => field.id), ['title', 'url', 'capturedAt', 'project', 'tags', 'note', 'evidenceType', 'deliveryStatus', 'screenshot']);
  assert.deepEqual(custom.fields.map((field) => field.id), ['title', 'url']);
  const schema = [{ name: 'Name', type: 'title' }, { name: 'URL', type: 'url' }];
  assert.deepEqual(validateTemplateMapping(custom, schema, { title: 'Name', url: 'URL' }), { valid: true, errors: [], unsupportedFields: [] });
  assert.equal(validateTemplateMapping(custom, schema, { title: 'Other' }).valid, false);
});

test('deleting a user template never touches archived evidence cards', () => {
  const custom = createUserTemplate({ name: 'Temp', fields: [{ id: 'title', label: 'Name', required: true, types: ['title'] }] }, 'user-temp');
  const remaining = removeUserTemplate([custom], 'user-temp');
  assert.deepEqual(remaining, []);
  assert.equal(allTemplates([custom]).some((template) => template.id === 'user-temp'), true);
});
