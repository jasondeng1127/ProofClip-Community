export const NOTION_VERSION = '2026-03-11';
const textEncoder = new TextEncoder();
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
// This is a delivery safeguard, not a capture truncation point. The extension
// retains the full local record and a caller receives an explicit error here.
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_CHILDREN_PER_REQUEST = 100;
const MAX_EXTERNAL_IMAGES = 12;

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function richText(content, href = '') {
  const link = safeHttpUrl(href);
  return [{ type: 'text', text: { content: String(content || '').slice(0, 1900), ...(link ? { link: { url: link } } : {}) } }];
}
function paragraph(content) { return { object: 'block', type: 'paragraph', paragraph: { rich_text: richText(content) } }; }
function chunks(value, size = 1900) { const text = String(value || ''); return Array.from({ length: Math.ceil(text.length / size) }, (_, index) => text.slice(index * size, (index + 1) * size)); }
function apiError(status) { return new Error(status === 401 ? 'Notion authorization is no longer valid.' : status === 429 ? 'Notion is temporarily rate limited.' : 'Notion could not complete this request.'); }

const TEXT_CONTENT_BLOCK_TYPES = new Set(['heading_1', 'heading_2', 'heading_3', 'paragraph', 'bulleted_list_item', 'numbered_list_item', 'quote', 'code']);

function renderStructuredBlocks(contentBlocks) {
  if (!Array.isArray(contentBlocks)) return [];
  const children = [];
  let imageCount = 0;
  for (const candidate of contentBlocks) {
    if (!candidate || typeof candidate !== 'object') continue;
    if (candidate.type === 'image') {
      const imageUrl = safeHttpsUrl(candidate.imageUrl);
      if (!imageUrl || imageCount >= MAX_EXTERNAL_IMAGES) continue;
      children.push({ object: 'block', type: 'image', image: { type: 'external', external: { url: imageUrl } } });
      imageCount += 1;
      continue;
    }
    if (!TEXT_CONTENT_BLOCK_TYPES.has(candidate.type)) continue;
    const text = String(candidate.text || '').trim();
    if (!text) continue;
    const type = candidate.type;
    children.push({ object: 'block', type, [type]: type === 'code' ? { rich_text: richText(text, candidate.href), language: 'plain text' } : { rich_text: richText(text, candidate.href) } });
  }
  return children;
}

function notionHeaders(accessToken, contentType) {
  return { Authorization: `Bearer ${accessToken}`, 'Notion-Version': NOTION_VERSION, ...(contentType ? { 'Content-Type': contentType } : {}) };
}

function pngBytes(screenshot) {
  if (!screenshot || screenshot.mimeType !== 'image/png' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(String(screenshot.dataUrl || ''))) throw new Error('Screenshot is invalid.');
  const encoded = screenshot.dataUrl.slice('data:image/png;base64,'.length);
  const binary = atob(encoded);
  if (!binary.length || binary.length > MAX_SCREENSHOT_BYTES) throw new Error('Screenshot exceeds the 5 MB limit.');
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

const FIELD_TYPES = {
  title: ['title'], url: ['url'], capturedAt: ['date'], project: ['select', 'rich_text'], tags: ['multi_select', 'rich_text'],
  note: ['rich_text'], evidenceType: ['select', 'rich_text'], deliveryStatus: ['status', 'select', 'rich_text'], screenshot: ['files'], bodyText: ['rich_text']
};

const STANDARD_TEMPLATE_FIELDS = [
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

const SETUP_PROPERTIES = [
  { field: 'url', name: 'URL', type: 'url', definition: { url: {} } },
  { field: 'capturedAt', name: 'Captured time', type: 'date', definition: { date: {} } },
  { field: 'project', name: 'Project', type: 'select', definition: { select: { options: [] } } },
  { field: 'tags', name: 'Tags', type: 'multi_select', definition: { multi_select: { options: [] } } },
  { field: 'note', name: 'Note', type: 'rich_text', definition: { rich_text: {} } },
  { field: 'evidenceType', name: 'Evidence type', type: 'select', definition: { select: { options: [] } } },
  { field: 'deliveryStatus', name: 'Delivery status', type: 'select', definition: { select: { options: [] } } }
];

function setupError(message, status = 409) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function dataSourceProperties(dataSource) {
  return dataSource?.properties && typeof dataSource.properties === 'object' && !Array.isArray(dataSource.properties) ? dataSource.properties : null;
}

function titleProperty(properties) {
  const titles = Object.entries(properties).filter(([, property]) => property?.type === 'title');
  if (titles.length !== 1) throw setupError('The selected Data Source must have exactly one title property.');
  return titles[0][0];
}

function settingsFromSchema(dataSourceId, properties) {
  const title = titleProperty(properties);
  const fieldMappings = { title };
  const propertyTypes = { title: 'title' };
  for (const property of SETUP_PROPERTIES) {
    const configured = properties[property.name];
    if (!configured || configured.type !== property.type) throw setupError(`Data Source property "${property.name}" must use ${property.type}.`);
    fieldMappings[property.field] = property.name;
    propertyTypes[property.field] = property.type;
  }
  return { dataSourceId, templateId: 'buyer-account', templateFields: STANDARD_TEMPLATE_FIELDS, fieldMappings, propertyTypes };
}

function configuredTemplateFields(target) {
  const saved = Array.isArray(target?.templateFields) && target.templateFields.length ? target.templateFields : STANDARD_TEMPLATE_FIELDS;
  return saved.map((field) => ({ id: String(field?.id || '').trim(), valueSource: String(field?.valueSource || field?.id || '').trim() })).filter((field) => field.id && FIELD_TYPES[field.valueSource]);
}

function mappingFor(target, field, fallbackName = '', fallbackType = '') {
  const mapped = String(target?.fieldMappings?.[field.id] || '').trim();
  const property = mapped || String(fallbackName || '').trim();
  if (!property) return null;
  const type = String(target?.propertyTypes?.[field.id] || (mapped ? '' : fallbackType)).trim();
  if (!FIELD_TYPES[field.valueSource].includes(type)) throw new Error(`${field.id === 'title' ? 'Title' : field.id} mapping must use ${FIELD_TYPES[field.valueSource].join(' or ')}.`);
  return { property, type };
}

function propertyValue(source, type, record, screenshotUploadId) {
  if (source === 'bodyText') return { rich_text: record.bodyText ? richText(record.bodyText) : [] };
  if (source === 'title') return { title: richText(record.title) };
  if (source === 'url') return { url: record.canonicalUrl || null };
  if (source === 'capturedAt') return { date: record.capturedAt ? { start: record.capturedAt } : null };
  if (source === 'project') { const value = record.projectName || record.projectId; return type === 'select' ? { select: value ? { name: value } : null } : { rich_text: value ? richText(value) : [] }; }
  if (source === 'tags') return type === 'multi_select' ? { multi_select: (record.tags || []).map((name) => ({ name })) } : { rich_text: record.tags?.length ? richText(record.tags.join(', ')) : [] };
  if (source === 'note') return { rich_text: record.note ? richText(record.note) : [] };
  if (source === 'evidenceType') return type === 'select' ? { select: record.mode ? { name: record.mode } : null } : { rich_text: record.mode ? richText(record.mode) : [] };
  if (source === 'deliveryStatus') {
    const value = 'SENT';
    return type === 'status' ? { status: { name: value } } : type === 'select' ? { select: { name: value } } : { rich_text: richText(value) };
  }
  if (source === 'screenshot') return screenshotUploadId ? { files: [{ file_upload: { id: screenshotUploadId } }] } : null;
  return null;
}

export async function listDataSources(accessToken, fetchImpl = fetch) {
  const response = await fetchImpl('https://api.notion.com/v1/search', { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Notion-Version': NOTION_VERSION }, body: JSON.stringify({ filter: { property: 'object', value: 'data_source' } }) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw apiError(response.status);
  return (body.results || []).map((item) => ({ id: item.id, title: (item.title || []).map((part) => part.plain_text).join(''), properties: Object.entries(item.properties || {}).map(([name, value]) => ({ name, type: value.type })) }));
}

export async function setupProofClipDataSource(accessToken, dataSourceId, fetchImpl = fetch) {
  if (!/^[a-f0-9-]{32,36}$/i.test(String(dataSourceId || ''))) throw setupError('Data Source is invalid.', 400);
  const endpoint = `https://api.notion.com/v1/data_sources/${encodeURIComponent(dataSourceId)}`;
  const retrieved = await fetchImpl(endpoint, { method: 'GET', headers: notionHeaders(accessToken) });
  const schema = await retrieved.json().catch(() => ({}));
  if (!retrieved.ok) throw apiError(retrieved.status);
  const properties = dataSourceProperties(schema);
  if (!properties) throw apiError(500);
  titleProperty(properties);
  const missing = {};
  for (const property of SETUP_PROPERTIES) {
    const configured = properties[property.name];
    if (configured && configured.type !== property.type) throw setupError(`Data Source property "${property.name}" must use ${property.type}, but uses ${configured.type}.`);
    if (!configured) missing[property.name] = property.definition;
  }
  if (!Object.keys(missing).length) return settingsFromSchema(dataSourceId, properties);
  const updated = await fetchImpl(endpoint, { method: 'PATCH', headers: notionHeaders(accessToken, 'application/json'), body: JSON.stringify({ properties: missing }) });
  const finalSchema = await updated.json().catch(() => ({}));
  if (!updated.ok) throw apiError(updated.status);
  const finalProperties = dataSourceProperties(finalSchema);
  if (!finalProperties) throw apiError(500);
  return settingsFromSchema(dataSourceId, finalProperties);
}

export function buildCapturePayload(record, target, screenshotUploadId = null) {
  if (!record || typeof record.title !== 'string' || typeof record.canonicalUrl !== 'string' || typeof record.bodyText !== 'string') throw new Error('Capture record is invalid.');
  if (!target || !/^[a-f0-9-]{32,36}$/i.test(String(target.dataSourceId || ''))) throw new Error('Target Data Source is invalid.');
  if (textEncoder.encode(record.bodyText).byteLength > MAX_BODY_BYTES) throw new Error('Capture body exceeds the 4 MiB Notion delivery limit.');
  /** @type {Record<string, unknown>} */
  const properties = {};
  for (const field of configuredTemplateFields(target)) {
    const fallbackName = field.id === 'title' ? target.titleProperty || 'Name' : field.id === 'url' ? target.urlProperty || 'URL' : '';
    const fallbackType = field.id === 'title' ? 'title' : field.id === 'url' ? 'url' : '';
    const mapped = mappingFor(target, field, fallbackName, fallbackType);
    if (!mapped) continue;
    const value = propertyValue(field.valueSource, mapped.type, record, screenshotUploadId);
    if (value) properties[mapped.property] = value;
  }
  const provenance = [
    `Source: ${record.canonicalUrl}`,
    `Captured: ${record.capturedAt || ''}`,
    `Mode: ${record.mode || 'body'}`,
    record.mode !== 'region' && record.truncated ? 'This previously saved record was truncated.' : '',
    record.mode !== 'region' && record.bodySha256 ? `SHA-256: ${record.bodySha256}` : ''
  ].filter(Boolean).map(paragraph);
  const image = screenshotUploadId ? [{ object: 'block', type: 'image', image: { type: 'file_upload', file_upload: { id: screenshotUploadId } } }] : [];
  // Region captures send only the screenshot plus Source/Captured/Mode
  // provenance (v0.7 rule); the local archive keeps bodyText for search.
  const structuredBlocks = record.mode === 'body' && record.contentBlocksComplete === true ? renderStructuredBlocks(record.contentBlocks) : [];
  const textBlocks = structuredBlocks.length ? structuredBlocks : record.mode === 'region' ? [] : chunks(record.bodyText).map(paragraph);
  return { parent: { data_source_id: target.dataSourceId }, properties, children: [...provenance, ...textBlocks, ...image] };
}

export async function uploadPngScreenshot(accessToken, screenshot, fetchImpl = fetch) {
  const bytes = pngBytes(screenshot);
  const created = await fetchImpl('https://api.notion.com/v1/file_uploads', {
    method: 'POST', headers: notionHeaders(accessToken, 'application/json'),
    body: JSON.stringify({ mode: 'single_part', filename: 'proofclip-evidence.png', content_type: 'image/png' })
  });
  const createdBody = await created.json().catch(() => ({}));
  if (!created.ok || !createdBody.id) throw apiError(created.status);
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'image/png' }), 'proofclip-evidence.png');
  const sent = await fetchImpl(`https://api.notion.com/v1/file_uploads/${encodeURIComponent(createdBody.id)}/send`, {
    method: 'POST', headers: notionHeaders(accessToken), body: form
  });
  if (!sent.ok) throw apiError(sent.status);
  return createdBody.id;
}

export async function writeCapture(accessToken, record, target, fetchImpl = fetch) {
  // Validate the full record and target before creating an irreversible Notion
  // upload. A stale Data Source must not leave an orphaned screenshot file.
  const basePayload = buildCapturePayload(record, target, null);
  const screenshotUploadId = record?.screenshot ? await uploadPngScreenshot(accessToken, record.screenshot, fetchImpl) : null;
  const payload = screenshotUploadId ? buildCapturePayload(record, target, screenshotUploadId) : basePayload;
  const { parent, properties, children } = payload;
  const response = await fetchImpl('https://api.notion.com/v1/pages', { method: 'POST', headers: notionHeaders(accessToken, 'application/json'), body: JSON.stringify({ parent, properties, children: children.slice(0, MAX_CHILDREN_PER_REQUEST) }) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw apiError(response.status);
  // Long pages exceed Notion's 100-children-per-request limit; append the rest
  // in batches. A failed append throws so the caller surfaces the partial page
  // instead of silently shipping a half-page.
  const pageId = body.id;
  for (let offset = MAX_CHILDREN_PER_REQUEST; offset < children.length; offset += MAX_CHILDREN_PER_REQUEST) {
    const batch = children.slice(offset, offset + MAX_CHILDREN_PER_REQUEST);
    const append = await fetchImpl(`https://api.notion.com/v1/blocks/${encodeURIComponent(pageId)}/children`, { method: 'PATCH', headers: notionHeaders(accessToken, 'application/json'), body: JSON.stringify({ children: batch }) });
    if (!append.ok) throw apiError(append.status);
  }
  return { id: body.id, url: body.url || '' };
}
