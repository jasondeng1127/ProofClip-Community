import { truncateText } from './text.mjs';
import { normalizeEvidenceCard } from './evidence-card.mjs';

// v0.7: long pages are captured in full (previously 30,000 characters were
// silently truncated). 200,000 is a defensive ceiling, not a product limit.
const MAX_CAPTURE_CHARS = 200000;

export async function sha256(text) {
  const bytes = new TextEncoder().encode(String(text ?? ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createEvidenceRecord(page, mode, details = {}) {
  if (mode === 'selection' && !String(page.selection || '').trim()) {
    throw new Error('Select text on the page, then try again.');
  }
  const source = mode === 'selection' ? page.selection : page.bodyText;
  const result = truncateText(source, MAX_CAPTURE_CHARS);
  const capturedAt = new Date().toISOString();
  return normalizeEvidenceCard({
    id: crypto.randomUUID(),
    title: String(page.title || 'Untitled page').slice(0, 500),
    canonicalUrl: String(page.canonicalUrl || page.url || ''),
    capturedAt,
    mode,
    bodyText: result.text,
    bodySha256: await sha256(result.text),
    truncated: result.truncated,
    delivery: { status: 'PENDING', updatedAt: capturedAt },
    ...details
  });
}

export function publicEvidenceRecord(record) {
  const { delivery, ...evidence } = record;
  return { ...evidence, delivery };
}
