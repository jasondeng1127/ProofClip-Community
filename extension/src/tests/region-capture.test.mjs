import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applyWatermark, clampCrop, drawWatermark, fitWatermarkText, MAX_REGION_PNG_BYTES, regionPngTooLargeError, watermarkText } from '../core/region-capture.mjs';

test('clamps a region crop to the visible viewport', () => {
  assert.deepEqual(
    clampCrop({ x: -10, y: 15, width: 30, height: 20 }, { width: 100, height: 80 }),
    { x: 0, y: 15, width: 20, height: 20 }
  );
  assert.deepEqual(
    clampCrop({ x: 90, y: 70, width: 20, height: 20 }, { width: 100, height: 80 }),
    { x: 90, y: 70, width: 10, height: 10 }
  );
});

test('rejects empty, inverted and fully offscreen crop regions', () => {
  assert.equal(clampCrop({ x: 3, y: 4, width: 0, height: 10 }, { width: 100, height: 80 }), null);
  assert.equal(clampCrop({ x: 3, y: 4, width: -10, height: 10 }, { width: 100, height: 80 }), null);
  assert.equal(clampCrop({ x: 110, y: 4, width: 10, height: 10 }, { width: 100, height: 80 }), null);
});

test('region screenshots enforce the local size limit with a clear error', () => {
  assert.equal(regionPngTooLargeError(MAX_REGION_PNG_BYTES), null);
  assert.equal(regionPngTooLargeError(MAX_REGION_PNG_BYTES + 1), 'Region screenshot exceeds the 3 MB local limit. Choose a smaller region.');
  assert.equal(regionPngTooLargeError(Number.NaN), null);
});

test('watermark text combines the English ISO timestamp and source URL', () => {
  assert.equal(watermarkText('2026-08-09T10:00:00.000Z', 'https://example.test/price'), 'Captured 2026-08-09T10:00:00.000Z · https://example.test/price');
  assert.equal(watermarkText('', ''), '');
  assert.equal(watermarkText('2026-08-09T10:00:00.000Z', ''), 'Captured 2026-08-09T10:00:00.000Z');
});

test('watermark text is bounded for very long URLs', () => {
  const long = `https://example.test/${'a'.repeat(200)}`;
  const fitted = fitWatermarkText(watermarkText('2026-08-09T10:00:00.000Z', long));
  assert.ok(fitted.length <= 80);
  assert.match(fitted, /…$/);
});

test('drawWatermark paints a bottom bar and the label via the injected context', () => {
  const calls = { rects: [], texts: [] };
  const context = {
    save() {}, restore() {},
    fillRect(x, y, width, height) { calls.rects.push([x, y, width, height]); },
    fillText(text, x, y, maxWidth) { calls.texts.push({ text, x, y, maxWidth }); }
  };
  drawWatermark(context, { width: 640, height: 480, text: 'Captured 2026-08-09T10:00:00.000Z · https://example.test' });
  assert.equal(calls.rects.length, 1);
  const [, y, width, height] = calls.rects[0];
  assert.equal(width, 640);
  assert.equal(y + height, 480, 'bar must sit at the bottom edge');
  assert.match(calls.texts[0].text, /^Captured 2026-08-09T10:00:00\.000Z · https:\/\/example\.test$/);
  assert.equal(calls.texts[0].maxWidth, 620);
});

test('applyWatermark throws when the canvas is missing and stays a no-op on empty text', () => {
  assert.throws(() => applyWatermark(null, { capturedAt: 'x', url: 'y' }), /canvas is missing/);
  const context = { fillRect() {}, fillText() {}, save() {}, restore() {} };
  const canvas = { width: 100, height: 100, getContext: () => context };
  applyWatermark(canvas, { capturedAt: '', url: '' });
});

test('region capture watermarks before the size check and keeps bodySha256 semantics', async () => {
  const module = await readFile(new URL('../core/region-capture.mjs', import.meta.url), 'utf8');
  const background = await readFile(new URL('../background.js', import.meta.url), 'utf8');
  assert.match(module, /applyWatermark\(canvas, meta\)/);
  assert.match(module, /size check runs after watermarking/);
  assert.match(background, /cropViewportPng\(viewportPng, region, \{ width: region\.viewportWidth, height: region\.viewportHeight \}, \{ capturedAt, url: page\.canonicalUrl \|\| page\.url \}\)/);
  assert.match(background, /const capturedAt = new Date\(\)\.toISOString\(\)/);
  assert.match(background, /createEvidenceRecord\(page, 'region', \{ screenshot, capturedAt \}\)/);
});

test('screenshot decoding keeps fetch first and falls back to base64 Blob decode (audit MINOR-9)', async () => {
  const source = await readFile(new URL('../core/region-capture.mjs', import.meta.url), 'utf8');
  assert.match(source, /const response = await fetch\(dataUrl\);/);
  assert.match(source, /catch \{[\s\S]*?imageBitmapFromDataUrl\(dataUrl\)/);
  assert.match(source, /createImageBitmap\(new Blob\(\[bytes\], \{ type: 'image\/png' \}\)/);
});
