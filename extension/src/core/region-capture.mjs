export function clampCrop(crop, viewport) {
  const x = Number(crop?.x);
  const y = Number(crop?.y);
  const width = Number(crop?.width);
  const height = Number(crop?.height);
  const viewportWidth = Number(viewport?.width);
  const viewportHeight = Number(viewport?.height);
  if (![x, y, width, height, viewportWidth, viewportHeight].every(Number.isFinite) || width <= 0 || height <= 0 || viewportWidth <= 0 || viewportHeight <= 0) return null;
  const left = Math.max(0, x);
  const top = Math.max(0, y);
  const right = Math.min(viewportWidth, x + width);
  const bottom = Math.min(viewportHeight, y + height);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export const MAX_REGION_PNG_BYTES = 3 * 1024 * 1024;

export function regionPngTooLargeError(byteLength) {
  const limitMb = Math.round(MAX_REGION_PNG_BYTES / (1024 * 1024));
  return Number.isFinite(Number(byteLength)) && Number(byteLength) > MAX_REGION_PNG_BYTES
    ? `Region screenshot exceeds the ${limitMb} MB local limit. Choose a smaller region.`
    : null;
}

export function watermarkText(capturedAt, url) {
  const when = String(capturedAt || '').trim();
  const source = String(url || '').trim();
  const parts = [];
  if (when) parts.push(`Captured ${when}`);
  if (source) parts.push(source);
  return parts.join(' · ');
}

export function fitWatermarkText(text, maxChars = 80) {
  const value = String(text || '');
  return value.length <= maxChars ? value : `${value.slice(0, maxChars - 1)}…`;
}

export function drawWatermark(context, { width, height, text }) {
  if (!context || typeof context.fillRect !== 'function' || typeof context.fillText !== 'function') return;
  const label = fitWatermarkText(text);
  if (!label) return;
  const fontSize = Math.max(11, Math.round(Number(height) * 0.045));
  context.save();
  context.font = `600 ${fontSize}px system-ui, sans-serif`;
  context.textBaseline = 'middle';
  context.fillStyle = 'rgba(0, 0, 0, 0.55)';
  const barHeight = Math.max(22, fontSize + 12);
  context.fillRect(0, height - barHeight, width, barHeight);
  context.fillStyle = 'rgba(255, 255, 255, 0.92)';
  const padding = 10;
  context.fillText(label, padding, height - barHeight / 2, Math.max(0, width - padding * 2));
  context.restore();
}

export function applyWatermark(canvas, meta, draw = drawWatermark) {
  if (!canvas || typeof canvas.getContext !== 'function') throw new Error('Watermark canvas is missing.');
  const context = canvas.getContext('2d');
  const text = watermarkText(meta?.capturedAt, meta?.url);
  draw(context, { width: canvas.width, height: canvas.height, text });
  return canvas;
}

// Fallback decoder for the screenshot data URL. `fetch(data:)` works in Chrome
// but is not part of the Fetch spec, so if it fails we decode base64 ourselves
// and build the bitmap from a Blob. Worker-safe (no DOM Image required).
function imageBitmapFromDataUrl(dataUrl) {
  const encoded = String(dataUrl || '').slice('data:image/png;base64,'.length);
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return createImageBitmap(new Blob([bytes], { type: 'image/png' }));
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function cropViewportPng(dataUrl, crop, viewport, meta = {}) {
  const normalized = clampCrop(crop, viewport);
  if (!normalized) throw new Error('The selected screenshot area is invalid.');
  let bitmap;
  try {
    const response = await fetch(dataUrl);
    bitmap = await createImageBitmap(await response.blob());
  } catch {
    bitmap = await imageBitmapFromDataUrl(dataUrl);
  }
  const scaleX = bitmap.width / Number(viewport.width);
  const scaleY = bitmap.height / Number(viewport.height);
  const sourceX = Math.round(normalized.x * scaleX);
  const sourceY = Math.round(normalized.y * scaleY);
  const sourceWidth = Math.max(1, Math.round(normalized.width * scaleX));
  const sourceHeight = Math.max(1, Math.round(normalized.height * scaleY));
  const canvas = new OffscreenCanvas(sourceWidth, sourceHeight);
  const context = canvas.getContext('2d');
  context.drawImage(bitmap, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
  bitmap.close();
  applyWatermark(canvas, meta);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // The size check runs after watermarking so watermarked output still obeys
  // the 3 MB local limit.
  const sizeError = regionPngTooLargeError(bytes.byteLength);
  if (sizeError) throw new Error(sizeError);
  return {
    mimeType: 'image/png',
    dataUrl: `data:image/png;base64,${arrayBufferToBase64(bytes)}`,
    width: sourceWidth,
    height: sourceHeight
  };
}
