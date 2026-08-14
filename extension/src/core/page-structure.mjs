import { prepareReadablePage } from './site-readable-adapters.mjs';

const TEXT_BLOCK_TYPES = Object.freeze({
  h1: 'heading_1',
  h2: 'heading_2',
  h3: 'heading_3',
  p: 'paragraph',
  blockquote: 'quote',
  pre: 'code'
});

const BLOCK_SELECTOR = 'h1, h2, h3, p, li, blockquote, pre, img';
const MAX_IMAGES = 12;

function safeHttpUrl(value, baseUrl) {
  const candidate = String(value || '').trim();
  if (!candidate) return '';
  try {
    const url = new URL(candidate, baseUrl || undefined);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function directParentTag(node) {
  return String(node?.parentElement?.tagName || node?.parentNode?.tag || node?.parent?.tag || '').toLowerCase();
}

function firstSafeLink(node, baseUrl) {
  for (const link of node.querySelectorAll?.('a') || []) {
    const href = safeHttpUrl(link.href || link.getAttribute?.('href'), baseUrl);
    if (href) return href;
  }
  return '';
}

function imageUrl(node, baseUrl) {
  for (const candidate of [
    node.currentSrc,
    node.src,
    node.getAttribute?.('src'),
    node.getAttribute?.('data-src'),
    node.getAttribute?.('data-original'),
    node.getAttribute?.('data-lazy-src')
  ]) {
    const url = safeHttpUrl(candidate, baseUrl);
    if (url) return url;
  }
  return '';
}

function backgroundImageUrl(node, baseUrl) {
  if (!String(node.textContent || '').trim()) return '';
  const background = node.__proofclipBackgroundImage || globalThis.getComputedStyle?.(node)?.backgroundImage || node.style?.backgroundImage || node.backgroundImage || node.computedBackgroundImage || '';
  const match = String(background).match(/url\(\s*(['"]?)(.*?)\1\s*\)/i);
  return safeHttpUrl(match?.[2], baseUrl);
}

export function extractStructuredPage(root, { hostname, baseUrl, excludedSelectors, contentSelectors, applyAdapters = true } = {}) {
  if (!root || typeof root.cloneNode !== 'function' || typeof root.querySelectorAll !== 'function') {
    throw new Error('Page root is not a DOM node.');
  }
  const source = prepareReadablePage(root, { hostname, baseUrl, excludedSelectors, contentSelectors, applyAdapters });
  const bodyText = String(source.innerText || source.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  const contentBlocks = [];
  let contentBlocksComplete = true;
  let imageCount = 0;
  const seenImageUrls = new Set();

  const addImage = (imageUrl) => {
    if (!imageUrl || imageCount >= MAX_IMAGES || seenImageUrls.has(imageUrl)) return;
    contentBlocks.push({ type: 'image', imageUrl });
    seenImageUrls.add(imageUrl);
    imageCount += 1;
  };

  for (const node of [source, ...source.querySelectorAll('*')]) {
    if (node.closest?.(excludedSelectors)) continue;
    addImage(backgroundImageUrl(node, baseUrl));
    const tag = String(node.tagName || node.tag || '').toLowerCase();
    if (tag === 'img') {
      addImage(imageUrl(node, baseUrl));
      continue;
    }
    const type = tag === 'li'
      ? directParentTag(node) === 'ol' ? 'numbered_list_item' : 'bulleted_list_item'
      : TEXT_BLOCK_TYPES[tag];
    const text = String(node.textContent || '').trim();
    if (!type || !text) continue;
    const href = firstSafeLink(node, baseUrl);
    contentBlocks.push(href ? { type, text, href } : { type, text });
  }

  return { bodyText, contentBlocks, contentBlocksComplete };
}
