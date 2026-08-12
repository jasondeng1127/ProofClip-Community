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

export function normalizeEvidenceCard(record) {
  if (!record || typeof record !== 'object') throw new Error('Evidence card is required.');
  return {
    ...record,
    title: compact(record.title || 'Untitled page').slice(0, 500),
    projectId: compact(record.projectId) || 'unfiled',
    tags: normalizeTags(record.tags),
    // Notes keep internal newlines; only surrounding whitespace is trimmed.
    note: String(record.note ?? '').trim(),
    screenshot: normalizeScreenshot(record.screenshot)
  };
}
