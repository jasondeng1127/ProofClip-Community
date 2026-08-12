// Pure local DOM rule cleaning for captured page bodies (v0.7).
// No network, no AI: only selector rules and heuristics. A cleaning error must
// never block a capture; callers fall back to the raw innerText.

export const CONTENT_SELECTORS = 'article, main, [role="main"], #mainbar, .markdown-body, .md-content, .post-content, [itemprop="articleBody"]';

export const EXCLUDED_SELECTORS = [
  'nav', 'header', 'footer', 'aside', 'form', 'script', 'style', 'noscript', 'iframe', 'svg',
  '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]', '[role="complementary"]',
  '.ad', '.ads', '.advertisement', '.advert', '[class*="ad-"]', '[id*="ad-"]', '[class*="advert"]', '[id*="advert"]',
  '.cookie', '#cookie', '.cookie-banner', '.consent', '.gdpr', '.cc-banner', '[class*="cookie"]', '[id*="cookie"]',
  '.comments', '#comments', '.comment-list', '[class*="comment"]', '[id*="comment"]',
  '.nav', '.navbar', '.navigation', '.menu', '.sidebar', '.side', '.related', '.recommend',
  '.promo', '.sponsor', '.sponsored', '.subscribe', '.newsletter', '.share', '.social',
  '.header', '.footer', '.breadcrumb', '.pagination', '.toc', '.table-of-contents'
].join(', ');

export function cleanPageBody(root) {
  if (!root || typeof root.cloneNode !== 'function' || typeof root.querySelectorAll !== 'function') {
    throw new Error('Page root is not a DOM node.');
  }
  const clone = root.cloneNode(true);
  for (const node of clone.querySelectorAll(EXCLUDED_SELECTORS)) node.remove();
  const article = clone.querySelector(CONTENT_SELECTORS);
  const source = article || clone;
  return (source.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
}
