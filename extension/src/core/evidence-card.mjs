function compact(value) {
  return String(value ?? '').trim();
}

function normalizeTags(tags) {
  const unique = new Set();
  for (const tag of Array.isArray(tags) ? tags : []) {
    const normalized = compact(tag).toLowerCase();
    if (normalized) unique.add(normalized);
  }
  return [...unique];
}

function normalizeScreenshot(screenshot) {
  if (screenshot == null) return null;
  if (typeof screenshot !== 'object' || screenshot.mimeType !== 'image/png' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(String(screenshot.dataUrl || ''))) {
    throw new Error('Regional screenshots must be valid PNG data.');
  }
  const width = Number(screenshot.width);
  const height = Number(screenshot.height);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new Error('Regional screenshots must include positive dimensions.');
  }
  return { mimeType: 'image/png', dataUrl: screenshot.dataUrl, width, height };
}

const TEXT_CONTENT_BLOCK_TYPES = new Set(['heading_1', 'heading_2', 'heading_3', 'paragraph', 'bulleted_list_item', 'numbered_list_item', 'quote', 'code']);
const MAX_CONTENT_IMAGES = 12;

function normalizeHttpUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function normalizeContentBlocks(value) {
  if (!Array.isArray(value)) return [];
  const blocks = [];
  let imageCount = 0;
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') continue;
    if (candidate.type === 'image') {
      const imageUrl = normalizeHttpUrl(candidate.imageUrl);
      if (imageUrl && imageCount < MAX_CONTENT_IMAGES) {
        blocks.push({ type: 'image', imageUrl });
        imageCount += 1;
      }
      continue;
    }
    if (!TEXT_CONTENT_BLOCK_TYPES.has(candidate.type)) continue;
    const text = compact(candidate.text);
    if (!text) continue;
    const href = normalizeHttpUrl(candidate.href);
    blocks.push(href ? { type: candidate.type, text, href } : { type: candidate.type, text });
  }
  return blocks;
}

export function normalizeEvidenceCard(record) {
  if (!record || typeof record !== 'object') throw new Error('Evidence card is required.');
  return {
    ...record,
    title: compact(record.title || 'Untitled page').slice(0, 500),
    projectId: compact(record.projectId) || 'unfiled',
    tags: normalizeTags(record.tags),
    // Notes keep internal newlines; only surrounding whitespace is trimmed.
    note: String(record.note ?? '').trim(),
    screenshot: normalizeScreenshot(record.screenshot),
    contentBlocks: record.mode === 'body' ? normalizeContentBlocks(record.contentBlocks) : [],
    contentBlocksComplete: record.mode === 'body' && record.contentBlocksComplete === true
  };
}
