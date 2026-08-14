import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareReadablePage } from '../core/site-readable-adapters.mjs';

function documentFor() {
  return {
    createElement(tag) { return element(tag); }
  };
}

function element(tag, options = {}, children = [], document = documentFor()) {
  let ownText = options.text || '';
  const node = {
    tag: tag.toLowerCase(),
    tagName: tag.toUpperCase(),
    id: options.id || '',
    className: options.className || '',
    role: options.role || '',
    alt: options.alt || '',
    src: options.src || '',
    href: options.href || '',
    ownerDocument: document,
    children: [],
    parentNode: null,
    parentElement: null,
    append(child) { child.parentNode = node; child.parentElement = node; node.children.push(child); },
    insertBefore(child, reference) {
      child.parentNode = node; child.parentElement = node;
      node.children.splice(node.children.indexOf(reference), 0, child);
    },
    remove() {
      if (node.parentNode) node.parentNode.children = node.parentNode.children.filter((child) => child !== node);
      node.parentNode = null; node.parentElement = null;
    },
    cloneNode(deep) {
      return element(tag, { ...options, text: ownText }, deep ? node.children.map((child) => child.cloneNode(true)) : [], document);
    },
    getAttribute(name) {
      return ({ id: node.id, class: node.className, role: node.role, alt: node.alt, src: node.src, href: node.href })[name] || null;
    },
    setAttribute(name, value) { node[name === 'class' ? 'className' : name] = String(value); },
    matches(selector) { return selectors(selector).some((part) => matches(node, part)); },
    closest(selector) { for (let current = node; current; current = current.parentElement) if (current.matches(selector)) return current; return null; },
    querySelectorAll(selector) { return descendants(node).filter((child) => child.matches(selector)); },
    querySelector(selector) { return node.querySelectorAll(selector)[0] || null; },
    get textContent() { return [ownText, ...node.children.map((child) => child.textContent)].filter(Boolean).join(' ').trim(); },
    set textContent(value) { ownText = String(value); node.children = []; },
    get innerText() { return node.textContent; }
  };
  for (const child of children) node.append(child);
  return node;
}

function selectors(selector) { return String(selector || '').split(',').map((part) => part.trim()).filter(Boolean); }
function descendants(root) { return root.children.flatMap((child) => [child, ...descendants(child)]); }
function matches(node, selector) {
  if (selector === '*') return true;
  if (selector.startsWith('#')) return node.id === selector.slice(1);
  if (selector.startsWith('.')) return node.className.split(/\s+/).includes(selector.slice(1));
  const attr = selector.match(/^\[([^=~*]+)(?:([*~]?=)[\"']?([^\]"']+)[\"']?)?\]$/);
  if (attr) {
    const value = String(node.getAttribute(attr[1]) || '');
    return !attr[2] || (attr[2] === '*=' ? value.includes(attr[3]) : value === attr[3]);
  }
  return node.tag === selector.toLowerCase();
}

test('Wikipedia preparation removes the current Main Page sister and language tails without removing article evidence', () => {
  const root = element('body', {}, [
    element('main', { role: 'main' }, [
      element('h1', { text: 'Article title' }),
      element('p', { text: 'Article citation [1].' }),
      element('img', { src: 'https://images.example.test/article.png' }),
      element('section', { id: 'mp-sister', text: 'Wikipedia sister projects' }, [element('img', { src: 'https://images.example.test/sister.png' })]),
      element('div', { id: 'mp-sister-content', text: 'Wikivoyage Free travel guide' }),
      element('section', { id: 'mp-lang', text: 'Wikipedia languages' }),
      element('div', { className: 'wikipedia-languages', text: 'Deutsch Español 中文' }),
      element('section', { id: 'mp-other', text: 'More languages and other portals' })
    ])
  ]);

  const prepared = prepareReadablePage(root, { hostname: 'en.wikipedia.org', contentSelectors: 'main', excludedSelectors: 'footer' });

  assert.match(prepared.textContent, /Article citation \[1\]/);
  assert.doesNotMatch(prepared.textContent, /sister projects|Wikivoyage|languages|Deutsch|More languages/i);
  assert.deepEqual(prepared.querySelectorAll('img').map((image) => image.src), ['https://images.example.test/article.png']);
});

test('CBP preparation preserves all four current usa-card-group cards in source order and keeps following content', () => {
  const root = element('body', {}, [element('main', { role: 'main' }, [
    element('img', { className: 'site-logo', alt: 'CBP logo', src: 'https://cbp.gov/logo.png' }),
    element('ul', { className: 'usa-card-group' }, [
      element('li', { className: 'tablet:grid-col-3 usa-card show-button' }, [element('div', { className: 'usa-card__container' }, [element('img', { src: '/sites/default/files/know-before.jpg' }), element('h2', { text: 'Know Before You Go: Traveling Abroad' }), element('p', { text: 'Prepare for travel.' })])]),
      element('li', { className: 'tablet:grid-col-3 usa-card show-button' }, [element('div', { className: 'usa-card__container' }, [element('img', { src: '/sites/default/files/epp.jpg' }), element('h2', { text: 'Enhanced Passenger Processing (EPP)' }), element('p', { text: 'Use EPP before arrival.' })])]),
      element('li', { className: 'tablet:grid-col-3 usa-card show-button' }, [element('div', { className: 'usa-card__container' }, [element('img', { src: '/sites/default/files/trusted.jpg' }), element('h2', { text: 'Trusted Traveler Programs' }), element('p', { text: 'Explore trusted travel.' })])]),
      element('li', { className: 'tablet:grid-col-3 usa-card show-button' }, [element('div', { className: 'usa-card__container' }, [element('img', { src: '/sites/default/files/mobile.jpg' }), element('h2', { text: 'Mobile Apps Directory' }), element('p', { text: 'Find CBP mobile apps.' })])])
    ]),
    element('h2', { text: 'Citizenship Resource Center' }),
    element('p', { text: 'The next section remains after every card.' })
  ])]);

  const prepared = prepareReadablePage(root, { hostname: 'www.cbp.gov', baseUrl: 'https://www.cbp.gov/travel/us-citizens', contentSelectors: 'main', excludedSelectors: 'footer' });
  const blocks = prepared.querySelectorAll('img, h2, p').map((node) => node.tag === 'img' ? ['image', node.src] : [node.tag, node.textContent]);

  assert.deepEqual(blocks, [
    ['image', 'https://www.cbp.gov/sites/default/files/know-before.jpg'], ['h2', 'Know Before You Go: Traveling Abroad'], ['p', 'Prepare for travel.'],
    ['image', 'https://www.cbp.gov/sites/default/files/epp.jpg'], ['h2', 'Enhanced Passenger Processing (EPP)'], ['p', 'Use EPP before arrival.'],
    ['image', 'https://www.cbp.gov/sites/default/files/trusted.jpg'], ['h2', 'Trusted Traveler Programs'], ['p', 'Explore trusted travel.'],
    ['image', 'https://www.cbp.gov/sites/default/files/mobile.jpg'], ['h2', 'Mobile Apps Directory'], ['p', 'Find CBP mobile apps.'],
    ['h2', 'Citizenship Resource Center'], ['p', 'The next section remains after every card.']
  ]);
  assert.equal(prepared.querySelectorAll('img').some((image) => image.src.includes('logo')), false);
});

test('CBP preparation does not rewrite unrelated groups that merely contain repeated article cards', () => {
  const root = element('body', {}, [element('main', { role: 'main' }, [
    element('section', { className: 'news-grid' }, [
      element('article', {}, [element('h3', { text: 'Travel notice' }), element('p', { text: 'Bring documents.' }), element('img', { src: 'https://cbp.gov/travel.png' })]),
      element('article', {}, [element('h3', { text: 'Cargo notice' }), element('p', { text: 'Declare goods.' }), element('img', { src: 'https://cbp.gov/cargo.png' })])
    ])
  ])]);

  const prepared = prepareReadablePage(root, { hostname: 'www.cbp.gov', contentSelectors: 'main', excludedSelectors: 'footer' });

  assert.equal(prepared.tag, 'main');
  assert.equal(prepared.querySelectorAll('section').at(0).className, 'news-grid');
  assert.deepEqual(prepared.querySelectorAll('h3').map((node) => node.textContent), ['Travel notice', 'Cargo notice']);
});

test('CBP preparation filters logo, icon and tracking image-name variants only inside a known USA card grid', () => {
  const root = element('body', {}, [element('main', { role: 'main' }, [
    element('img', { className: 'site_logo', src: 'https://cbp.gov/site_logo.png' }),
    element('img', { className: 'headerLogo', src: 'https://cbp.gov/headerLogo.png' }),
    element('img', { className: 'tracking_pixel', src: 'https://cbp.gov/tracking_pixel.gif' }),
    element('ul', { className: 'usa-card-group' }, [
      element('li', { className: 'usa-card' }, [element('h2', { text: 'Travel notice' }), element('p', { text: 'Bring documents.' }), element('img', { src: 'https://cbp.gov/travel.png' })]),
      element('li', { className: 'usa-card' }, [element('h2', { text: 'Cargo notice' }), element('p', { text: 'Declare goods.' }), element('img', { src: 'https://cbp.gov/cargo.png' })])
    ])
  ])]);

  const prepared = prepareReadablePage(root, { hostname: 'www.cbp.gov', contentSelectors: 'main', excludedSelectors: 'footer' });

  assert.deepEqual(prepared.querySelectorAll('img').map((image) => image.src), ['https://cbp.gov/travel.png', 'https://cbp.gov/cargo.png']);
});

test('CBP preparation retains content images whose names merely contain icon text', () => {
  const root = element('body', {}, [element('main', { role: 'main' }, [
    element('ul', { className: 'usa-card-group' }, [
      element('li', { className: 'usa-card' }, [element('h2', { text: 'Inspection update' }), element('p', { text: 'Inspect shipments.' }), element('img', { src: 'https://cbp.gov/silicon-chip-inspection.jpg' })]),
      element('li', { className: 'usa-card' }, [element('h2', { text: 'Border update' }), element('p', { text: 'Review crossings.' }), element('img', { src: 'https://cbp.gov/iconic-border-crossing.jpg' })])
    ])
  ])]);

  const prepared = prepareReadablePage(root, { hostname: 'www.cbp.gov', contentSelectors: 'main', excludedSelectors: 'footer' });

  assert.deepEqual(prepared.querySelectorAll('img').map((image) => image.src), [
    'https://cbp.gov/silicon-chip-inspection.jpg', 'https://cbp.gov/iconic-border-crossing.jpg'
  ]);
});
