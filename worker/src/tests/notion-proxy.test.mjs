import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCapturePayload, listDataSources, uploadPngScreenshot, writeCapture } from '../notion-proxy.mjs';
import * as notionProxy from '../notion-proxy.mjs';
import { mergeSettings } from '../../../extension/src/core/storage.mjs';

test('capture payload remains bounded and uses Data Source parent', () => {
  const payload = buildCapturePayload({ title: 'Evidence', canonicalUrl: 'https://example.com', bodyText: 'body', capturedAt: '2026-07-28T00:00:00Z', mode: 'body', bodySha256: 'abc' }, { dataSourceId: '01be583b-00d5-83d8-845f-0784db446a24', titleProperty: 'Name', urlProperty: 'URL' });
  assert.equal(payload.parent.data_source_id, '01be583b-00d5-83d8-845f-0784db446a24');
  assert.equal(payload.properties.Name.title[0].text.content, 'Evidence');
  assert.equal(payload.properties.URL.url, 'https://example.com');
});

test('body structured content maps to safe matching Notion blocks', () => {
  const payload = buildCapturePayload(
    {
      title: 'Structured evidence', canonicalUrl: 'https://example.com', bodyText: 'plain fallback must not ship', capturedAt: '2026-08-09T00:00:00Z', mode: 'body',
      contentBlocksComplete: true,
      contentBlocks: [
        { type: 'heading_1', text: 'Top heading' },
        { type: 'heading_2', text: 'Price details' },
        { type: 'heading_3', text: 'SKU notes' },
        { type: 'paragraph', text: 'Read the terms', href: 'https://example.com/terms' },
        { type: 'bulleted_list_item', text: 'MOQ 500' },
        { type: 'numbered_list_item', text: 'Step one' },
        { type: 'quote', text: 'Buyer quote' },
        { type: 'code', text: 'const price = 10;' },
        { type: 'paragraph', text: 'x'.repeat(1901) },
        { type: 'image', imageUrl: 'https://cdn.example.com/keep.png' },
        { type: 'image', imageUrl: 'http://cdn.example.com/insecure.png' },
        { type: 'image', imageUrl: 'data:image/png;base64,aGVsbG8=' },
        { type: 'image', imageUrl: 'not a url' },
        ...Array.from({ length: 12 }, (_, index) => ({ type: 'image', imageUrl: `https://cdn.example.com/${index + 2}.png` }))
      ]
    },
    { dataSourceId: '01be583b-00d5-83d8-845f-0784db446a24', titleProperty: 'Name', urlProperty: 'URL' }
  );
  const structured = payload.children.slice(3);
  assert.deepEqual(structured.map((block) => block.type), ['heading_1', 'heading_2', 'heading_3', 'paragraph', 'bulleted_list_item', 'numbered_list_item', 'quote', 'code', 'paragraph', ...Array(12).fill('image')]);
  assert.deepEqual(structured[3].paragraph.rich_text[0].text.link, { url: 'https://example.com/terms' });
  assert.equal(structured[7].code.language, 'plain text');
  assert.equal(structured[8].paragraph.rich_text[0].text.content.length, 1900);
  assert.deepEqual(structured[9].image, { type: 'external', external: { url: 'https://cdn.example.com/keep.png' } });
  const imageUrls = structured.filter((block) => block.type === 'image').map((block) => block.image.external.url);
  assert.deepEqual(imageUrls, ['https://cdn.example.com/keep.png', ...Array.from({ length: 11 }, (_, index) => `https://cdn.example.com/${index + 2}.png`)]);
  assert.equal(structured.some((block) => block.paragraph?.rich_text?.some((part) => part.text.content.includes('plain fallback must not ship'))), false);
});

test('complete long structured captures keep blocks after the former 400-block boundary', () => {
  const payload = buildCapturePayload(
    {
      title: 'Long structured evidence', canonicalUrl: 'https://example.com/long', bodyText: 'fallback must not replace complete structure', capturedAt: '2026-08-12T00:00:00Z', mode: 'body',
      contentBlocksComplete: true,
      contentBlocks: Array.from({ length: 401 }, (_, index) => index === 400
        ? { type: 'image', imageUrl: 'https://cdn.example.com/after-400.png' }
        : { type: 'paragraph', text: `Paragraph ${index + 1}` })
    },
    { dataSourceId: '01be583b-00d5-83d8-845f-0784db446a24', titleProperty: 'Name', urlProperty: 'URL' }
  );
  const structured = payload.children.slice(3);
  assert.equal(structured.length, 401);
  assert.deepEqual(structured.at(-1), { object: 'block', type: 'image', image: { type: 'external', external: { url: 'https://cdn.example.com/after-400.png' } } });
});

test('body delivery uses canonical text unless structured blocks are explicitly complete', () => {
  const target = { dataSourceId: '01be583b-00d5-83d8-845f-0784db446a24', titleProperty: 'Name', urlProperty: 'URL' };
  const incomplete = buildCapturePayload(
    {
      title: 'Long evidence', canonicalUrl: 'https://example.com', bodyText: 'Paragraph 401 must be sent', capturedAt: '2026-08-09T00:00:00Z', mode: 'body',
      contentBlocksComplete: false,
      contentBlocks: [{ type: 'heading_1', text: 'Partial heading must not ship' }, { type: 'image', imageUrl: 'https://cdn.example.com/partial.png' }]
    },
    target
  );
  const incompleteText = incomplete.children.flatMap((block) => block.paragraph?.rich_text || []).map((part) => part.text.content).join('\n');
  assert.match(incompleteText, /Paragraph 401 must be sent/);
  assert.equal(incomplete.children.some((block) => block.type === 'heading_1' || block.type === 'image'), false);

  const legacy = buildCapturePayload(
    {
      title: 'Legacy evidence', canonicalUrl: 'https://example.com', bodyText: 'Legacy canonical body text', capturedAt: '2026-08-09T00:00:00Z', mode: 'body',
      contentBlocks: [{ type: 'heading_2', text: 'Legacy partial heading' }]
    },
    target
  );
  const legacyText = legacy.children.flatMap((block) => block.paragraph?.rich_text || []).map((part) => part.text.content).join('\n');
  assert.match(legacyText, /Legacy canonical body text/);
  assert.equal(legacy.children.some((block) => block.type === 'heading_2'), false);
});

test('legacy body records retain provenance and paragraph fallback when structured blocks are absent or invalid', () => {
  const target = { dataSourceId: '01be583b-00d5-83d8-845f-0784db446a24', titleProperty: 'Name', urlProperty: 'URL' };
  for (const contentBlocks of [undefined, [{ type: 'unsupported', text: 'ignore' }, { type: 'paragraph', text: '   ' }]]) {
    const payload = buildCapturePayload(
      { title: 'Legacy evidence', canonicalUrl: 'https://example.com', bodyText: 'legacy body text', capturedAt: '2026-08-09T00:00:00Z', mode: 'body', contentBlocks },
      target
    );
    assert.deepEqual(payload.children.map((block) => block.type), ['paragraph', 'paragraph', 'paragraph', 'paragraph']);
    assert.equal(payload.children.at(-1).paragraph.rich_text[0].text.content, 'legacy body text');
  }
});

test('region records ignore supplied structured blocks and omit body structure', () => {
  const payload = buildCapturePayload(
    {
      title: 'Region evidence', canonicalUrl: 'https://example.com', bodyText: 'region body must not ship', capturedAt: '2026-08-09T00:00:00Z', mode: 'region',
      contentBlocks: [{ type: 'heading_2', text: 'Region heading' }, { type: 'image', imageUrl: 'https://cdn.example.com/region.png' }]
    },
    { dataSourceId: '01be583b-00d5-83d8-845f-0784db446a24', titleProperty: 'Name', urlProperty: 'URL' }
  );
  assert.deepEqual(payload.children.map((block) => block.type), ['paragraph', 'paragraph', 'paragraph']);
});

test('legacy truncated evidence carries a generic integrity warning into Notion content', () => {
  const payload = buildCapturePayload(
    { title: 'Evidence', canonicalUrl: 'https://example.com', bodyText: 'body', capturedAt: '2026-07-28T00:00:00Z', mode: 'body', truncated: true },
    { dataSourceId: '01be583b-00d5-83d8-845f-0784db446a24', titleProperty: 'Name', urlProperty: 'URL' }
  );
  const text = payload.children.flatMap((block) => block.paragraph?.rich_text || []).map((part) => part.text.content).join('\n');
  assert.match(text, /This previously saved record was truncated\./);
  assert.doesNotMatch(text, /200,000/);
});

test('capture payload accepts text beyond the retired 800,000-byte ceiling and rejects only the documented safety ceiling', () => {
  const record = { title: 'Evidence', canonicalUrl: 'https://example.com', bodyText: 'body' };
  assert.throws(() => buildCapturePayload(record, { dataSourceId: 'wrong' }), /Target Data Source/);
  assert.doesNotThrow(() => buildCapturePayload({ ...record, bodyText: 'x'.repeat(800_001) }, { dataSourceId: '01be583b-00d5-83d8-845f-0784db446a24' }));
  assert.throws(() => buildCapturePayload({ ...record, bodyText: 'x'.repeat((4 * 1024 * 1024) + 1) }, { dataSourceId: '01be583b-00d5-83d8-845f-0784db446a24' }), /4 MiB/);
});

test('long capture creates the page with 100 children and appends the remainder in batches', async () => {
  const calls = [];
  const record = { title: 'Long page', canonicalUrl: 'https://example.com/long', bodyText: `${'x'.repeat(800_001)}PROOFCLIP-LONG-PAGE-TAIL`, capturedAt: '2026-08-09T00:00:00Z', mode: 'body', bodySha256: 'abc' };
  const target = { dataSourceId: '01be583b-00d5-83d8-845f-0784db446a24', titleProperty: 'Name', urlProperty: 'URL' };
  const result = await writeCapture('ntn_test', record, target, async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/pages')) return new Response(JSON.stringify({ id: 'page-long', url: 'https://www.notion.so/page-long' }), { status: 200 });
    if (url.endsWith('/blocks/page-long/children')) return new Response(JSON.stringify({}, { status: 200 }));
    throw new Error('unexpected request');
  });
  assert.equal(result.id, 'page-long');
  const create = calls.find((call) => call.url.endsWith('/pages'));
  const appends = calls.filter((call) => call.url.endsWith('/blocks/page-long/children'));
  const createdChildren = JSON.parse(create.options.body).children.length;
  assert.equal(createdChildren, 100);
  const totalChildren = createdChildren + appends.reduce((sum, call) => sum + JSON.parse(call.options.body).children.length, 0);
  assert.ok(totalChildren > 100, 'long page must exceed one request');
  for (const call of appends) {
    assert.equal(call.options.method, 'PATCH');
    assert.ok(JSON.parse(call.options.body).children.length <= 100);
  }
  const finalAppend = JSON.parse(appends.at(-1).options.body).children;
  const finalText = finalAppend.flatMap((block) => block.paragraph?.rich_text || []).map((part) => part.text.content).join('');
  assert.match(finalText, /PROOFCLIP-LONG-PAGE-TAIL$/);
  assert.equal(totalChildren, buildCapturePayload(record, target).children.length, 'no block may be duplicated or dropped');
});

test('a failed append throws so the partial page is surfaced instead of silently shipped', async () => {
  const record = { title: 'Long page', canonicalUrl: 'https://example.com/long', bodyText: 'x'.repeat(200_000), capturedAt: '2026-08-09T00:00:00Z', mode: 'body', bodySha256: 'abc' };
  const target = { dataSourceId: '01be583b-00d5-83d8-845f-0784db446a24', titleProperty: 'Name', urlProperty: 'URL' };
  await assert.rejects(
    () => writeCapture('ntn_test', record, target, async (url) => {
      if (url.endsWith('/pages')) return new Response(JSON.stringify({ id: 'page-long' }), { status: 200 });
      return new Response(JSON.stringify({}), { status: 500 });
    }),
    /could not complete/
  );
});

test('Notion provider failures become readable status-specific errors without provider details', async () => {
  const record = { title: 'Evidence', canonicalUrl: 'https://example.com', bodyText: 'body' };
  const target = { dataSourceId: '01be583b-00d5-83d8-845f-0784db446a24' };
  const expected = new Map([[401, /no longer valid/], [429, /temporarily rate limited/], [500, /could not complete/]]);
  for (const [status, message] of expected) {
    const fetchImpl = async () => new Response(JSON.stringify({ message: 'provider detail must not escape' }), { status });
    await assert.rejects(() => listDataSources('ntn_test', fetchImpl), message);
    await assert.rejects(() => writeCapture('ntn_test', record, target, fetchImpl), message);
  }
});

test('uploads a bounded PNG screenshot through the Notion single-part file flow', async () => {
  const calls = [];
  const screenshot = { mimeType: 'image/png', dataUrl: 'data:image/png;base64,aGVsbG8=', width: 20, height: 10 };
  const id = await uploadPngScreenshot('ntn_test', screenshot, async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/file_uploads')) return new Response(JSON.stringify({ id: 'file-1' }), { status: 200 });
    if (url.endsWith('/file_uploads/file-1/send')) return new Response(JSON.stringify({ id: 'file-1', status: 'uploaded' }), { status: 200 });
    throw new Error('unexpected request');
  });
  assert.equal(id, 'file-1');
  assert.deepEqual(JSON.parse(calls[0].options.body), { mode: 'single_part', filename: 'proofclip-evidence.png', content_type: 'image/png' });
  assert.equal(calls[1].options.body instanceof FormData, true);
  assert.equal(calls[1].options.headers['Content-Type'], undefined);
});

test('an invalid target rejects a region capture before any Notion screenshot upload is created', async () => {
  const calls = [];
  const record = {
    title: 'Region evidence', canonicalUrl: 'https://example.com', bodyText: '', capturedAt: '2026-08-09T00:00:00Z', mode: 'region',
    screenshot: { mimeType: 'image/png', dataUrl: 'data:image/png;base64,aGVsbG8=', width: 20, height: 10 }
  };
  await assert.rejects(
    () => writeCapture('token', record, { dataSourceId: 'bad' }, async (url) => { calls.push(String(url)); throw new Error('Notion must not be called'); }),
    /Target Data Source is invalid/
  );
  assert.equal(calls.filter((url) => url.includes('/file_uploads')).length, 0);
  assert.equal(calls.length, 0);
});

test('uploads and attaches a region screenshot as an image block without body text', async () => {
  const calls = [];
  const record = { title: 'Evidence', canonicalUrl: 'https://example.com', bodyText: 'body', capturedAt: '2026-07-28T00:00:00Z', mode: 'region', screenshot: { mimeType: 'image/png', dataUrl: 'data:image/png;base64,aGVsbG8=', width: 20, height: 10 } };
  const target = { dataSourceId: '01be583b-00d5-83d8-845f-0784db446a24', titleProperty: 'Name', urlProperty: 'URL' };
  await writeCapture('ntn_test', record, target, async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/file_uploads')) return new Response(JSON.stringify({ id: 'file-2' }), { status: 200 });
    if (url.endsWith('/file_uploads/file-2/send')) return new Response(JSON.stringify({ id: 'file-2', status: 'uploaded' }), { status: 200 });
    if (url.endsWith('/pages')) return new Response(JSON.stringify({ id: 'page', url: 'https://www.notion.so/page' }), { status: 200 });
    throw new Error('unexpected request');
  });
  const payload = JSON.parse(calls.at(-1).options.body);
  assert.deepEqual(payload.children.at(-1), { object: 'block', type: 'image', image: { type: 'file_upload', file_upload: { id: 'file-2' } } });
  const text = payload.children.filter((block) => block.paragraph).map((block) => block.paragraph.rich_text[0].text.content).join('\n');
  assert.doesNotMatch(text, /body/);
});

test('region delivery sends only the screenshot and Source/Captured/Mode provenance', () => {
  const payload = buildCapturePayload(
    { title: 'Region evidence', canonicalUrl: 'https://example.com', bodyText: 'should not ship', capturedAt: '2026-08-09T00:00:00Z', mode: 'region', bodySha256: 'abc', screenshot: { mimeType: 'image/png', dataUrl: 'data:image/png;base64,aGVsbG8=' } },
    { dataSourceId: '01be583b-00d5-83d8-845f-0784db446a24', titleProperty: 'Name', urlProperty: 'URL' },
    'file-region'
  );
  const text = payload.children.filter((block) => block.paragraph).map((block) => block.paragraph.rich_text[0].text.content).join('\n');
  assert.match(text, /Source: https:\/\/example\.com/);
  assert.match(text, /Captured: 2026-08-09T00:00:00Z/);
  assert.match(text, /Mode: region/);
  assert.doesNotMatch(text, /SHA-256/);
  assert.doesNotMatch(text, /should not ship/);
  assert.deepEqual(payload.children.at(-1), { object: 'block', type: 'image', image: { type: 'file_upload', file_upload: { id: 'file-region' } } });
});

test('body and selection delivery still include body text and the SHA-256 line', () => {
  for (const mode of ['body', 'selection']) {
    const payload = buildCapturePayload(
      { title: 'Evidence', canonicalUrl: 'https://example.com', bodyText: 'page body text', capturedAt: '2026-08-09T00:00:00Z', mode, bodySha256: 'sha256hash' },
      { dataSourceId: '01be583b-00d5-83d8-845f-0784db446a24', titleProperty: 'Name', urlProperty: 'URL' }
    );
    const text = payload.children.filter((block) => block.paragraph).map((block) => block.paragraph.rich_text[0].text.content).join('\n');
    assert.match(text, /page body text/);
    assert.match(text, /SHA-256: sha256hash/);
    assert.match(text, new RegExp(`Mode: ${mode}`));
  }
});

test('maps V1 evidence fields to compatible configured Notion properties', () => {
  const payload = buildCapturePayload(
    { title: 'Evidence', canonicalUrl: 'https://example.com', bodyText: 'body', capturedAt: '2026-07-30T00:00:00.000Z', mode: 'region', projectId: 'buyers', projectName: 'Active buyers', tags: ['buyer', 'priority'], note: 'follow up', delivery: { status: 'PENDING' } },
    {
      dataSourceId: '01be583b-00d5-83d8-845f-0784db446a24',
      fieldMappings: { title: 'Name', url: 'URL', capturedAt: 'Captured', project: 'Project', tags: 'Tags', note: 'Note', evidenceType: 'Type', deliveryStatus: 'Status' },
      propertyTypes: { title: 'title', url: 'url', capturedAt: 'date', project: 'rich_text', tags: 'multi_select', note: 'rich_text', evidenceType: 'select', deliveryStatus: 'status' }
    }
  );
  assert.equal(payload.properties.Captured.date.start, '2026-07-30T00:00:00.000Z');
  assert.equal(payload.properties.Project.rich_text[0].text.content, 'Active buyers');
  assert.deepEqual(payload.properties.Tags.multi_select, [{ name: 'buyer' }, { name: 'priority' }]);
  assert.equal(payload.properties.Note.rich_text[0].text.content, 'follow up');
  assert.equal(payload.properties.Type.select.name, 'region');
  assert.equal(payload.properties.Status.status.name, 'PENDING');
});

test('maps a configured custom field from its saved capture value source', () => {
  const payload = buildCapturePayload(
    { title: 'Evidence', canonicalUrl: 'https://example.com', bodyText: 'Quoted product detail', capturedAt: '2026-07-30T00:00:00.000Z', mode: 'body' },
    {
      dataSourceId: '01be583b-00d5-83d8-845f-0784db446a24',
      fieldMappings: { title: 'Name', url: 'URL', 'quote-text': 'Quote text' },
      propertyTypes: { title: 'title', url: 'url', 'quote-text': 'rich_text' },
      templateFields: [
        { id: 'title', label: 'Title', required: true, types: ['title'], valueSource: 'title' },
        { id: 'url', label: 'URL', required: true, types: ['url'], valueSource: 'url' },
        { id: 'quote-text', label: 'Quote text', required: true, types: ['rich_text'], valueSource: 'bodyText' }
      ]
    }
  );
  assert.equal(payload.properties['Quote text'].rich_text[0].text.content, 'Quoted product detail');
});

test('rejects incompatible server-side property mappings before calling Notion', () => {
  assert.throws(() => buildCapturePayload(
    { title: 'Evidence', canonicalUrl: 'https://example.com', bodyText: 'body' },
    { dataSourceId: '01be583b-00d5-83d8-845f-0784db446a24', fieldMappings: { title: 'Name' }, propertyTypes: { title: 'url' } }
  ), /Title mapping/);
});

const SETUP_DATA_SOURCE_ID = '01be583b-00d5-83d8-845f-0784db446a24';
const SETUP_TEMPLATE_FIELDS = [
  { id: 'title', label: 'Title', required: true, valueSource: 'title', types: ['title'] },
  { id: 'url', label: 'URL', required: true, valueSource: 'url', types: ['url'] },
  { id: 'capturedAt', label: 'Captured time', required: false, valueSource: 'capturedAt', types: ['date'] },
  { id: 'project', label: 'Project', required: false, valueSource: 'project', types: ['select', 'rich_text'] },
  { id: 'tags', label: 'Tags', required: false, valueSource: 'tags', types: ['multi_select', 'rich_text'] },
  { id: 'note', label: 'Note', required: false, valueSource: 'note', types: ['rich_text'] },
  { id: 'evidenceType', label: 'Evidence type', required: false, valueSource: 'evidenceType', types: ['select', 'rich_text'] },
  { id: 'deliveryStatus', label: 'Delivery status', required: false, valueSource: 'deliveryStatus', types: ['status', 'select', 'rich_text'] },
  { id: 'screenshot', label: 'Screenshot', required: false, valueSource: 'screenshot', types: ['files'] }
];
const SETUP_FIELD_MAPPINGS = { title: 'Name', url: 'URL', capturedAt: 'Captured time', project: 'Project', tags: 'Tags', note: 'Note', evidenceType: 'Evidence type', deliveryStatus: 'Delivery status' };
const SETUP_PROPERTY_TYPES = { title: 'title', url: 'url', capturedAt: 'date', project: 'select', tags: 'multi_select', note: 'rich_text', evidenceType: 'select', deliveryStatus: 'select' };
function setupSchema(properties) { return { id: SETUP_DATA_SOURCE_ID, object: 'data_source', properties }; }

test('setup creates only missing ProofClip properties and returns an immediately usable mapping', async () => {
  const calls = [];
  const settings = await notionProxy.setupProofClipDataSource('ntn_test', SETUP_DATA_SOURCE_ID, async (url, options = {}) => {
    calls.push({ url, options });
    if (options.method === 'GET') return new Response(JSON.stringify(setupSchema({ Name: { type: 'title' } })), { status: 200 });
    if (options.method === 'PATCH') return new Response(JSON.stringify(setupSchema({
      Name: { type: 'title' }, URL: { type: 'url' }, 'Captured time': { type: 'date' }, Project: { type: 'select' }, Tags: { type: 'multi_select' },
      Note: { type: 'rich_text' }, 'Evidence type': { type: 'select' }, 'Delivery status': { type: 'select' }
    })), { status: 200 });
    throw new Error(`unexpected Notion request: ${url}`);
  });

  assert.deepEqual(settings, { dataSourceId: SETUP_DATA_SOURCE_ID, templateId: 'buyer-account', templateFields: SETUP_TEMPLATE_FIELDS, fieldMappings: SETUP_FIELD_MAPPINGS, propertyTypes: SETUP_PROPERTY_TYPES });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, `https://api.notion.com/v1/data_sources/${SETUP_DATA_SOURCE_ID}`);
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.headers['Notion-Version'], '2026-03-11');
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    properties: {
      URL: { url: {} }, 'Captured time': { date: {} }, Project: { select: { options: [] } }, Tags: { multi_select: { options: [] } },
      Note: { rich_text: {} }, 'Evidence type': { select: { options: [] } }, 'Delivery status': { select: { options: [] } }
    }
  });
});

test('setup is idempotent when every compatible ProofClip property already exists', async () => {
  const calls = [];
  const settings = await notionProxy.setupProofClipDataSource('ntn_test', SETUP_DATA_SOURCE_ID, async (url, options = {}) => {
    calls.push({ url, options });
    return new Response(JSON.stringify(setupSchema({
      Name: { type: 'title' }, URL: { type: 'url' }, 'Captured time': { type: 'date' }, Project: { type: 'select' }, Tags: { type: 'multi_select' },
      Note: { type: 'rich_text' }, 'Evidence type': { type: 'select' }, 'Delivery status': { type: 'select' }, 'User-owned property': { type: 'number' }
    })), { status: 200 });
  });

  assert.deepEqual(settings.fieldMappings, SETUP_FIELD_MAPPINGS);
  assert.deepEqual(settings.propertyTypes, SETUP_PROPERTY_TYPES);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'GET');
});

test('setup settings survive extension storage merging and retain every mapped optional field for capture delivery', async () => {
  const settings = await notionProxy.setupProofClipDataSource('ntn_test', SETUP_DATA_SOURCE_ID, async () => new Response(JSON.stringify(setupSchema({
    Name: { type: 'title' }, URL: { type: 'url' }, 'Captured time': { type: 'date' }, Project: { type: 'select' }, Tags: { type: 'multi_select' },
    Note: { type: 'rich_text' }, 'Evidence type': { type: 'select' }, 'Delivery status': { type: 'select' }
  })), { status: 200 }));
  const merged = mergeSettings({ dataSourceId: '' }, settings);
  const mappedOptionalFields = ['capturedAt', 'project', 'tags', 'note', 'evidenceType', 'deliveryStatus'];

  assert.deepEqual(merged.templateFields.map((field) => field.id), SETUP_TEMPLATE_FIELDS.map((field) => field.id));
  for (const id of mappedOptionalFields) assert.ok(merged.templateFields.some((field) => field.id === id), `${id} must survive mergeSettings`);
  const payload = buildCapturePayload(
    { title: 'Buyer page', canonicalUrl: 'https://example.com/buyer', bodyText: 'Captured buyer evidence', capturedAt: '2026-08-09T00:00:00.000Z', mode: 'body', projectName: 'Prospect', tags: ['buyer'], note: 'Follow up', delivery: { status: 'PENDING' } },
    merged
  );
  assert.deepEqual(Object.keys(payload.properties).sort(), ['Captured time', 'Delivery status', 'Evidence type', 'Name', 'Note', 'Project', 'Tags', 'URL'].sort());
  assert.equal(payload.properties['Captured time'].date.start, '2026-08-09T00:00:00.000Z');
  assert.equal(payload.properties.Project.select.name, 'Prospect');
  assert.deepEqual(payload.properties.Tags.multi_select, [{ name: 'buyer' }]);
  assert.equal(payload.properties.Note.rich_text[0].text.content, 'Follow up');
  assert.equal(payload.properties['Evidence type'].select.name, 'body');
  assert.equal(payload.properties['Delivery status'].select.name, 'PENDING');
});

test('setup reports a same-name incompatible property before any PATCH', async () => {
  const calls = [];
  await assert.rejects(
    () => notionProxy.setupProofClipDataSource('ntn_test', SETUP_DATA_SOURCE_ID, async (url, options = {}) => {
      calls.push({ url, options });
      return new Response(JSON.stringify(setupSchema({ Name: { type: 'title' }, URL: { type: 'rich_text' } })), { status: 200 });
    }),
    (error) => error.status === 409 && /URL.*url/i.test(error.message)
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'GET');
});
