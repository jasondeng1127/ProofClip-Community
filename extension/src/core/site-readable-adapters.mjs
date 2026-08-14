function textOf(node) {
  return String(node?.textContent || '').replace(/\s+/g, ' ').trim();
}

function tagOf(node) {
  return String(node?.tagName || node?.tag || '').toLowerCase();
}

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

function descendants(node) {
  return [node, ...(node?.querySelectorAll?.('*') || [])];
}

function attribute(node, name) {
  const value = node?.getAttribute?.(name);
  if (value) return String(value);
  if (name === 'class') return String(node?.className || '');
  return String(node?.[name] || '');
}

function removeMatching(root, selector) {
  for (const node of root.querySelectorAll?.(selector) || []) node.remove();
}

function snapshotBackgroundImages(root, clone) {
  const liveNodes = descendants(root);
  const cloneNodes = descendants(clone);
  for (let index = 0; index < Math.min(liveNodes.length, cloneNodes.length); index += 1) {
    const backgroundImage = globalThis.getComputedStyle?.(liveNodes[index])?.backgroundImage;
    if (backgroundImage && backgroundImage !== 'none') cloneNodes[index].__proofclipBackgroundImage = backgroundImage;
  }
}

function isWikipedia(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host.endsWith('.wikipedia.org');
}

function isCbp(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === 'cbp.gov' || host.endsWith('.cbp.gov');
}

function removeWikipediaModules(root) {
  removeMatching(root, '#mw-sisterproject, #p-lang, #p-lang-btn, .mw-interlanguage-selector, .interlanguage-link, .sistersitebox, .sister-project, .sister-projects, #mp-sister, #mp-sister-content, #mp-lang, .wikipedia-languages, #mp-other');
}

function firstNode(root, predicate) {
  return descendants(root).find(predicate) || null;
}

function hasPresentationalImageMarker(node) {
  const marker = `${attribute(node, 'alt')} ${attribute(node, 'class')} ${attribute(node, 'id')} ${node.currentSrc || node.src || attribute(node, 'src')}`;
  return /(?:^|[-_./\s])(?:logo|icon|tracking|pixel|spacer)(?=$|[-_./\s])/i.test(marker)
    || /(?:[a-z0-9])(?:Logo|Icon|Tracking|Pixel|Spacer)(?=$|[A-Z]|[-_./\s])/.test(marker);
}

function hasClass(node, className) {
  return attribute(node, 'class').split(/\s+/).includes(className);
}

function isContentImage(node, baseUrl) {
  if (tagOf(node) !== 'img') return false;
  const src = safeHttpUrl(node.currentSrc || node.src || attribute(node, 'src') || attribute(node, 'data-src'), baseUrl);
  if (!src) return false;
  return attribute(node, 'role').toLowerCase() !== 'presentation'
    && attribute(node, 'aria-hidden').toLowerCase() !== 'true'
    && !hasPresentationalImageMarker(node);
}

function contentImage(card, baseUrl) {
  return firstNode(card, (node) => isContentImage(node, baseUrl));
}

function cardParts(card, baseUrl) {
  const heading = firstNode(card, (node) => /^h[1-6]$/.test(tagOf(node)) && textOf(node).length >= 3)
    || firstNode(card, (node) => tagOf(node) === 'a' && textOf(node).length >= 3);
  const summary = firstNode(card, (node) => tagOf(node) === 'p' && textOf(node).length >= 1);
  const image = contentImage(card, baseUrl);
  return heading && (summary || image) ? { heading: textOf(heading), summary: summary ? textOf(summary) : '', image } : null;
}

function flattenCbpCards(source, baseUrl) {
  for (const node of source.querySelectorAll?.('img') || []) if (hasPresentationalImageMarker(node)) node.remove();
  for (const group of descendants(source)) {
    if (tagOf(group) !== 'ul' || !hasClass(group, 'usa-card-group')) continue;
    const cards = Array.from(group?.children || []).filter((card) => tagOf(card) === 'li' && hasClass(card, 'usa-card'));
    const parts = cards.map((card) => cardParts(card, baseUrl));
    const insertionParent = group.parentNode;
    if (!cards.length || parts.some((part) => !part) || !insertionParent?.insertBefore || !group.ownerDocument?.createElement) continue;
    for (const part of parts) {
      if (part.image) {
        const image = group.ownerDocument.createElement('img');
        image.src = safeHttpUrl(part.image.currentSrc || part.image.src || attribute(part.image, 'src') || attribute(part.image, 'data-src'), baseUrl);
        insertionParent.insertBefore(image, group);
      }
      const heading = group.ownerDocument.createElement('h2');
      heading.textContent = part.heading;
      insertionParent.insertBefore(heading, group);
      if (part.summary) {
        const paragraph = group.ownerDocument.createElement('p');
        paragraph.textContent = part.summary;
        insertionParent.insertBefore(paragraph, group);
      }
    }
    group.remove();
  }
}

export function prepareReadablePage(root, { hostname, baseUrl, contentSelectors, excludedSelectors, applyAdapters = true } = {}) {
  if (!root || typeof root.cloneNode !== 'function' || typeof root.querySelectorAll !== 'function') {
    throw new Error('Page root is not a DOM node.');
  }
  const clone = root.cloneNode(true);
  snapshotBackgroundImages(root, clone);
  if (excludedSelectors) removeMatching(clone, excludedSelectors);
  if (applyAdapters && isWikipedia(hostname)) removeWikipediaModules(clone);
  const source = clone.querySelector?.(contentSelectors) || clone;
  if (applyAdapters && isCbp(hostname)) flattenCbpCards(source, baseUrl);
  return source;
}
