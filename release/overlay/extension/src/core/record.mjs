import { normalizeEvidenceCard } from './evidence-card.mjs';

export async function sha256(text) {
  const bytes = new TextEncoder().encode(String(text ?? ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createEvidenceRecord(page, mode, details = {}) {
  if (mode === 'selection' && !String(page.selection || '').trim()) {
    throw new Error('Select text on the page, then try again.');
  }
  // Canonical text is the immutable completeness fallback for every Full page.
  // Do not truncate it here: once an incomplete record is persisted, Archive
  // and Notion cannot reconstruct a missing tail. Delivery owns the explicit
  // service boundary and must fail visibly rather than silently shorten proof.
  const source = String(mode === 'selection' ? page.selection : page.bodyText || '');
  const capturedAt = new Date().toISOString();
  return normalizeEvidenceCard({
    id: crypto.randomUUID(),
    title: String(page.title || 'Untitled page').slice(0, 500),
    canonicalUrl: String(page.canonicalUrl || page.url || ''),
    capturedAt,
    mode,
    bodyText: source,
    bodySha256: await sha256(source),
    truncated: false,
    contentBlocks: mode === 'body' ? page.contentBlocks : [],
    contentBlocksComplete: mode === 'body' && page.contentBlocksComplete === true,
    delivery: { status: 'PENDING', updatedAt: capturedAt },
    ...details
  });
}

export function publicEvidenceRecord(record) {
  const { delivery, ...evidence } = record;
  return { ...evidence, delivery };
}
