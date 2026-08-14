// Duplicate-capture detection. Before a capture can create a successful work,
// the extension checks whether the same canonical URL
// already exists in the local archive. If it does, the user gets a
// non-blocking Continue / Cancel confirmation (3-second default: continue);
// Cancel aborts before any count or record is written.

export function normalizeCaptureUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(String(url));
    parsed.hash = '';
    parsed.search = '';
    const path = parsed.pathname.replace(/\/+$/, '');
    parsed.pathname = path || '/';
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.toLowerCase();
  } catch {
    return String(url).trim().toLowerCase();
  }
}

export function findRecentDuplicate(archive, canonicalUrl) {
  const target = normalizeCaptureUrl(canonicalUrl);
  if (!target) return null;
  let match = null;
  for (const record of archive || []) {
    const candidate = normalizeCaptureUrl(record?.canonicalUrl || record?.url);
    if (!candidate || candidate !== target) continue;
    if (!match || String(record.capturedAt || '') > String(match.capturedAt || '')) {
      match = { capturedAt: record.capturedAt || null, title: record.title || null };
    }
  }
  return match;
}

export function formatDuplicateTime(capturedAt) {
  if (!capturedAt) return 'an earlier time';
  const date = new Date(capturedAt);
  if (Number.isNaN(date.getTime())) return 'an earlier time';
  return date.toLocaleString();
}

export function duplicateConfirmMessage(capturedAt) {
  return `This page was already captured at ${formatDuplicateTime(capturedAt)}. Continue?`;
}
