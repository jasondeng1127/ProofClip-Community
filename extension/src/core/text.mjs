export function compactText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function truncateText(value, maxLength) {
  const text = String(value ?? '');
  if (text.length <= maxLength) return { text, truncated: false };
  return { text: text.slice(0, maxLength), truncated: true };
}

export function chunkText(value, maxLength = 1800) {
  const text = String(value ?? '');
  if (!text) return [];
  const chunks = [];
  let offset = 0;
  while (offset < text.length) {
    const end = Math.min(offset + maxLength, text.length);
    let split = end;
    if (end < text.length) {
      // Prefer the last newline, sentence end or space inside the window so
      // Notion blocks do not cut mid-word; never exceed the limit.
      const windowText = text.slice(offset, end);
      const boundary = Math.max(windowText.lastIndexOf('\n'), windowText.lastIndexOf('.'), windowText.lastIndexOf('。'), windowText.lastIndexOf(' '));
      if (boundary >= 0) split = offset + boundary + 1;
    }
    chunks.push(text.slice(offset, split));
    offset = split;
  }
  return chunks;
}

export function safeFilename(value) {
  return compactText(value || 'proofclip-evidence')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'proofclip-evidence';
}
