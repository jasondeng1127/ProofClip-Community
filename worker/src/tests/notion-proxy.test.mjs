import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCapturePayload, listDataSources, uploadPngScreenshot, writeCapture } from '../notion-proxy.mjs';

test('capture payload remains bounded and uses Data Source parent', () => {
  const payload = buildCapturePayload({ title: 'Evidence', canonicalUrl: 'https://example.com', bodyText: 'body', capturedAt: '2026-07-28T00:00:00Z', mode: 'body', bodySha256: 'abc' }, { dataSourceId: '00000000-0000-4000-8000-000000000001', titleProperty: 'Name', urlProperty: 'URL' });
  assert.equal(payload.parent.data_source_id, '00000000-0000-4000-8000-000000000001');
  assert.equal(payload.properties.Name.title[0].text.content, 'Evidence');
  assert.equal(payload.properties.URL.url, 'https://example.com');
});

test('truncated evidence carries the same integrity warning into Notion content', () => {
  const payload = buildCapturePayload(
    { title: 'Evidence', canonicalUrl: 'https://example.com', bodyText: 'body', capturedAt: '2026-07-28T00:00:00Z', mode: 'body', truncated: true },
    { dataSourceId: '00000000-0000-4000-8000-000000000001', titleProperty: 'Name', urlProperty: 'URL' }
  );
  const text = payload.children.flatMap((block) => block.paragraph?.rich_text || []).map((part) => part.text.content).join('\n');
  assert.match(text, /Text truncated at 200,000 characters\./);
});

test('capture payload rejects malformed target and oversized body', () => {
  const record = { title: 'Evidence', canonicalUrl: 'https://example.com', bodyText: 'body' };
  assert.throws(() => buildCapturePayload(record, { dataSourceId: 'wrong' }), /Target Data Source/);
  assert.throws(() => buildCapturePayload({ ...record, bodyText: 'x'.repeat(800_001) }, { dataSourceId: '00000000-0000-4000-8000-000000000001' }), /exceeds/);
});

test('long capture creates the page with 100 children and appends the remainder in batches', async () => {
  const calls = [];
  const record = { title: 'Long page', canonicalUrl: 'https://example.com/long', bodyText: 'x'.repeat(200_000), capturedAt: '2026-08-09T00:00:00Z', mode: 'body', bodySha256: 'abc' };
  const target = { dataSourceId: '00000000-0000-4000-8000-000000000001', titleProperty: 'Name', urlProperty: 'URL' };
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
  assert.equal(totalChildren, buildCapturePayload(record, target).children.length, 'no block may be duplicated or dropped');
});

test('a failed append throws so the partial page is surfaced instead of silently shipped', async () => {
  const record = { title: 'Long page', canonicalUrl: 'https://example.com/long', bodyText: 'x'.repeat(200_000), capturedAt: '2026-08-09T00:00:00Z', mode: 'body', bodySha256: 'abc' };
  const target = { dataSourceId: '00000000-0000-4000-8000-000000000001', titleProperty: 'Name', urlProperty: 'URL' };
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
  const target = { dataSourceId: '00000000-0000-4000-8000-000000000001' };
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
  const target = { dataSourceId: '00000000-0000-4000-8000-000000000001', titleProperty: 'Name', urlProperty: 'URL' };
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
    { dataSourceId: '00000000-0000-4000-8000-000000000001', titleProperty: 'Name', urlProperty: 'URL' },
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
      { dataSourceId: '00000000-0000-4000-8000-000000000001', titleProperty: 'Name', urlProperty: 'URL' }
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
      dataSourceId: '00000000-0000-4000-8000-000000000001',
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
      dataSourceId: '00000000-0000-4000-8000-000000000001',
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
    { dataSourceId: '00000000-0000-4000-8000-000000000001', fieldMappings: { title: 'Name' }, propertyTypes: { title: 'url' } }
  ), /Title mapping/);
});
