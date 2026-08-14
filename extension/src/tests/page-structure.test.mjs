import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extractStructuredPage } from '../core/page-structure.mjs';

function element(tag, options = {}, children = []) {
  let ownText = options.text || '';
  const node = {
    tag,
    tagName: tag.toUpperCase(),
    text: ownText,
    href: options.href || '',
    src: options.src || '',
    backgroundImage: options.backgroundImage || '',
    computedBackgroundImage: options.computedBackgroundImage || '',
    detached: Boolean(options.detached),
    id: options.id || '',
    className: options.className || '',
    children,
    parent: null,
    parentElement: null,
    parentNode: null,
    ownerDocument: { createElement: (childTag) => element(childTag) },
    cloneNode(deep) {
      const cloneOptions = { ...options, detached: true };
      if (options.cloneDropsComputed) delete cloneOptions.computedBackgroundImage;
      return element(tag, cloneOptions, deep ? this.children.map((child) => child.cloneNode(true)) : []);
    },
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
    },
    insertBefore(child, reference) {
      child.parent = this; child.parentElement = this; child.parentNode = this;
      this.children.splice(this.children.indexOf(reference), 0, child);
    },
    querySelectorAll(selector) { return queryAll(this, selector); },
    querySelector(selector) { return queryAll(this, selector)[0] || null; },
    getAttribute(name) {
      if (name === 'src') return options.src ?? null;
      if (name === 'href') return options.href ?? null;
      if (name === 'data-src') return options.dataSrc ?? null;
      if (name === 'data-original') return options.dataOriginal ?? null;
      if (name === 'data-lazy-src') return options.dataLazySrc ?? null;
      if (name === 'class') return options.className ?? null;
      if (name === 'id') return options.id ?? null;
      return null;
    },
    get textContent() {
      return [ownText, ...this.children.map((child) => child.textContent)].filter(Boolean).join(' ');
    },
    set textContent(value) { ownText = String(value); this.text = ownText; this.children = []; },
    get innerText() { return this.textContent; }
  };
  for (const child of children) {
    child.parent = node;
    child.parentElement = node;
    child.parentNode = node;
  }
  return node;
}

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must remain an executable background helper`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`${name} body is not closed`);
}

async function runtimePageExtractor() {
  const source = await readFile(new URL('../background.js', import.meta.url), 'utf8');
  return new Function(`return (${functionBody(source, 'extractPageEvidence')});`)();
}

function withRuntimePage(root, run) {
  const globals = ['document', 'window', 'location'].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  globalThis.document = {
    body: root,
    querySelector(selector) {
      if (selector === 'link[rel="canonical"]') return null;
      return root.querySelector?.(selector) || null;
    }
  };
  globalThis.window = { getSelection: () => ({ toString: () => '' }) };
  globalThis.location = { href: 'https://example.test/runtime' };
  try {
    return run();
  } finally {
    for (const [name, descriptor] of globals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}

function queryAll(root, selector) {
  const tags = String(selector).split(',').map((value) => value.trim()).filter(Boolean);
  const found = [];
  const matches = (node, candidate) => {
    if (candidate === '*' || candidate === node.tag || candidate === `.${node.className}` || candidate === `#${node.id}`) return true;
    const [tag, className] = candidate.split('.');
    return Boolean(className) && tag === node.tag && node.className.split(/\s+/).includes(className);
  };
  const walk = (node) => {
    for (const child of node.children || []) {
      if (tags.some((candidate) => matches(child, candidate))) found.push(child);
      walk(child);
    }
  };
  walk(root);
  return found;
}

function withComputedStyle(run) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'getComputedStyle');
  globalThis.getComputedStyle = (node) => ({ backgroundImage: node.detached ? '' : node.computedBackgroundImage || '' });
  try {
    return run();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'getComputedStyle', descriptor);
    else delete globalThis.getComputedStyle;
  }
}

test('extracts ordered semantic article blocks while removing excluded page noise', () => {
  const root = element('body', {}, [
    element('nav', { text: 'NAVIGATION SHOULD NOT APPEAR' }),
    element('article', {}, [
      element('h1', { text: 'Supplier update' }),
      element('p', {}, [element('a', { text: 'Read terms', href: 'https://example.test/terms' })]),
      element('ul', {}, [element('li', { text: 'First point' })]),
      element('ol', {}, [element('li', { text: 'Second point' })]),
      element('blockquote', { text: 'Buyer quote' }),
      element('pre', { text: 'const price = 10;' }),
      element('img', { src: 'https://cdn.example.test/photo.png' }),
      element('img', { src: 'javascript:alert(1)' })
    ])
  ]);

  const result = extractStructuredPage(root, { excludedSelectors: 'nav', contentSelectors: 'article' });

  assert.equal(result.bodyText.includes('NAVIGATION SHOULD NOT APPEAR'), false);
  assert.deepEqual(result.contentBlocks, [
    { type: 'heading_1', text: 'Supplier update' },
    { type: 'paragraph', text: 'Read terms', href: 'https://example.test/terms' },
    { type: 'bulleted_list_item', text: 'First point' },
    { type: 'numbered_list_item', text: 'Second point' },
    { type: 'quote', text: 'Buyer quote' },
    { type: 'code', text: 'const price = 10;' },
    { type: 'image', imageUrl: 'https://cdn.example.test/photo.png' }
  ]);
});

test('preserves more than 400 semantic blocks so long pages retain their structured images and text', () => {
  const root = element('body', {}, [element('article', {}, Array.from({ length: 401 }, (_, index) => element('p', { text: `Paragraph ${index + 1}` })))]);
  const result = extractStructuredPage(root, { excludedSelectors: 'nav', contentSelectors: 'article' });
  assert.equal(result.contentBlocks.length, 401);
  assert.deepEqual(result.contentBlocks.at(-1), { type: 'paragraph', text: 'Paragraph 401' });
  assert.equal(result.contentBlocksComplete, true);
  assert.match(result.bodyText, /Paragraph 401/);
});

test('marks a short semantic page complete', () => {
  const root = element('body', {}, [element('article', {}, [
    element('h1', { text: 'Complete page' }),
    element('p', { text: 'All semantic blocks fit.' })
  ])]);
  const result = extractStructuredPage(root, { excludedSelectors: 'nav', contentSelectors: 'article' });
  assert.equal(result.contentBlocksComplete, true);
});

test('caps extracted safe images at 12', () => {
  const root = element('body', {}, [element('article', {}, Array.from({ length: 13 }, (_, index) => element('img', { src: `https://cdn.example.test/${index + 1}.png` })))]);
  const result = extractStructuredPage(root, { excludedSelectors: 'nav', contentSelectors: 'article' });
  assert.equal(result.contentBlocks.length, 12);
  assert.deepEqual(result.contentBlocks.at(-1), { type: 'image', imageUrl: 'https://cdn.example.test/12.png' });
});

test('extracts safe lazy and content-bearing CSS background images', () => {
  const root = element('body', {}, [element('article', {}, [
    element('section', { computedBackgroundImage: 'url("https://cdn.example.test/hero.jpg")' }, [element('h1', { text: 'Hero article' })]),
    element('img', { dataSrc: 'https://cdn.example.test/lazy.png' }),
    element('div', { computedBackgroundImage: 'url("https://cdn.example.test/decorative.png")' }),
    element('section', { computedBackgroundImage: 'url("javascript:alert(1)")' }, [element('p', { text: 'Unsafe image is rejected' })])
  ])]);

  const result = withComputedStyle(() => extractStructuredPage(root, { excludedSelectors: 'nav', contentSelectors: 'article' }));

  assert.deepEqual(result.contentBlocks, [
    { type: 'image', imageUrl: 'https://cdn.example.test/hero.jpg' },
    { type: 'heading_1', text: 'Hero article' },
    { type: 'image', imageUrl: 'https://cdn.example.test/lazy.png' },
    { type: 'paragraph', text: 'Unsafe image is rejected' }
  ]);
});

test('the executable capture path matches the core semantic contract and keeps text fallback on extraction failure', async () => {
  const extractor = await runtimePageExtractor();
  const root = element('body', {}, [
    element('nav', { text: 'Navigation' }),
    element('article', {}, [element('h2', { text: 'Runtime heading' }), element('p', {}, [element('a', { text: 'Runtime link', href: 'https://example.test/link' })]), element('img', { src: 'https://cdn.example.test/runtime.png' })])
  ]);
  const expected = extractStructuredPage(root, { excludedSelectors: 'nav', contentSelectors: 'article' });
  const runtime = withRuntimePage(root, () => extractor('nav', 'article'));
  assert.equal(runtime.bodyText, expected.bodyText);
  assert.deepEqual(runtime.contentBlocks, expected.contentBlocks);
  assert.equal(runtime.contentBlocksComplete, expected.contentBlocksComplete);

  const brokenRoot = { innerText: 'Fallback text', cloneNode() { throw new Error('clone failure'); } };
  const fallback = withRuntimePage(brokenRoot, () => extractor('nav', 'article'));
  assert.equal(fallback.bodyText, 'Fallback text');
  assert.deepEqual(fallback.contentBlocks, []);
  assert.equal(fallback.contentBlocksComplete, false);
});

test('the executable capture path retains lazy and content CSS images', async () => {
  const extractor = await runtimePageExtractor();
  const root = element('body', {}, [element('article', {}, [
    element('section', { computedBackgroundImage: 'url("https://cdn.example.test/runtime-hero.jpg")' }, [element('h2', { text: 'Runtime hero' })]),
    element('img', { dataLazySrc: 'https://cdn.example.test/runtime-lazy.png' })
  ])]);
  const expected = withComputedStyle(() => extractStructuredPage(root, { excludedSelectors: 'nav', contentSelectors: 'article' }));
  const runtime = withComputedStyle(() => withRuntimePage(root, () => extractor('nav', 'article')));
  assert.deepEqual(runtime.contentBlocks, expected.contentBlocks);
});

test('core and executable extraction use the same Wikipedia adapter source', async () => {
  const extractor = await runtimePageExtractor();
  const root = element('body', {}, [element('main', {}, [
    element('h2', { text: 'Article evidence' }),
    element('p', { text: 'Citation remains.' }),
    element('aside', { id: 'mw-sisterproject', text: 'Sister project noise' })
  ])]);
  const options = { excludedSelectors: 'footer', contentSelectors: 'main', hostname: 'en.wikipedia.org' };
  const expected = extractStructuredPage(root, options);
  const runtime = withRuntimePage(root, () => {
    globalThis.location = { href: 'https://en.wikipedia.org/wiki/Example', hostname: 'en.wikipedia.org' };
    return extractor('footer', 'main');
  });
  assert.deepEqual(runtime, { title: 'Untitled page', url: 'https://en.wikipedia.org/wiki/Example', canonicalUrl: 'https://en.wikipedia.org/wiki/Example', selection: '', ...expected });
  assert.equal(expected.bodyText.includes('Sister project noise'), false);
});

test('core and executable extraction use the same current CBP card-grid source', async () => {
  const extractor = await runtimePageExtractor();
  const root = element('body', {}, [element('main', {}, [
    element('ul', { className: 'usa-card-group' }, [
      element('li', { className: 'usa-card' }, [element('img', { src: '/sites/default/files/know-before.jpg' }), element('h2', { text: 'Know Before You Go: Traveling Abroad' }), element('p', { text: 'Prepare for travel.' })]),
      element('li', { className: 'usa-card' }, [element('img', { src: '/sites/default/files/epp.jpg' }), element('h2', { text: 'Enhanced Passenger Processing (EPP)' }), element('p', { text: 'Use the processing lane.' })]),
      element('li', { className: 'usa-card' }, [element('img', { src: '/sites/default/files/trusted.jpg' }), element('h2', { text: 'Trusted Traveler Programs' }), element('p', { text: 'Apply for a program.' })]),
      element('li', { className: 'usa-card' }, [element('img', { src: '/sites/default/files/mobile.jpg' }), element('h2', { text: 'Mobile Apps Directory' }), element('p', { text: 'Use a mobile app.' })])
    ]),
    element('h2', { text: 'Citizenship Resource Center' }), element('p', { text: 'The next section remains after every card.' })
  ])]);
  const expected = extractStructuredPage(root, { hostname: 'www.cbp.gov', baseUrl: 'https://www.cbp.gov/travel/us-citizens', excludedSelectors: 'footer', contentSelectors: 'main' });
  const runtime = withRuntimePage(root, () => {
    globalThis.location = { href: 'https://www.cbp.gov/travel/us-citizens', hostname: 'www.cbp.gov' };
    return extractor('footer', 'main');
  });
  assert.deepEqual(runtime.contentBlocks, expected.contentBlocks);
  assert.deepEqual(expected.contentBlocks, [
    { type: 'image', imageUrl: 'https://www.cbp.gov/sites/default/files/know-before.jpg' }, { type: 'heading_2', text: 'Know Before You Go: Traveling Abroad' }, { type: 'paragraph', text: 'Prepare for travel.' },
    { type: 'image', imageUrl: 'https://www.cbp.gov/sites/default/files/epp.jpg' }, { type: 'heading_2', text: 'Enhanced Passenger Processing (EPP)' }, { type: 'paragraph', text: 'Use the processing lane.' },
    { type: 'image', imageUrl: 'https://www.cbp.gov/sites/default/files/trusted.jpg' }, { type: 'heading_2', text: 'Trusted Traveler Programs' }, { type: 'paragraph', text: 'Apply for a program.' },
    { type: 'image', imageUrl: 'https://www.cbp.gov/sites/default/files/mobile.jpg' }, { type: 'heading_2', text: 'Mobile Apps Directory' }, { type: 'paragraph', text: 'Use a mobile app.' },
    { type: 'heading_2', text: 'Citizenship Resource Center' }, { type: 'paragraph', text: 'The next section remains after every card.' }
  ]);
});

test('region extraction keeps Wikipedia and CBP source structures unadapted', async () => {
  const extractor = await runtimePageExtractor();
  const wikipediaRoot = element('body', {}, [element('main', {}, [
    element('p', { text: 'Article evidence.' }), element('aside', { id: 'mw-sisterproject', text: 'Sister project remains for region.' })
  ])]);
  const wikipedia = withRuntimePage(wikipediaRoot, () => {
    globalThis.location = { href: 'https://en.wikipedia.org/wiki/Example', hostname: 'en.wikipedia.org' };
    return extractor('footer', 'main', 'region');
  });
  assert.match(wikipedia.bodyText, /Sister project remains for region/);

  const cbpRoot = element('body', {}, [element('main', {}, [
    element('article', {}, [element('h3', { text: 'Travel notice' }), element('p', { text: 'Bring documents.' }), element('img', { src: 'https://cbp.gov/travel.png' })]),
    element('article', {}, [element('h3', { text: 'Cargo notice' }), element('p', { text: 'Declare goods.' }), element('img', { src: 'https://cbp.gov/cargo.png' })])
  ])]);
  const cbp = withRuntimePage(cbpRoot, () => {
    globalThis.location = { href: 'https://www.cbp.gov/travel', hostname: 'www.cbp.gov' };
    return extractor('footer', 'main', 'region');
  });
  assert.deepEqual(cbp.contentBlocks.slice(0, 3), [
    { type: 'heading_3', text: 'Travel notice' }, { type: 'paragraph', text: 'Bring documents.' }, { type: 'image', imageUrl: 'https://cbp.gov/travel.png' }
  ]);
});

test('generic extraction snapshots live CSS background images before cloning and matches executable output', async () => {
  const extractor = await runtimePageExtractor();
  const root = element('body', {}, [element('article', {}, [
    element('section', { computedBackgroundImage: 'url("https://cdn.example.test/live-only.jpg")', cloneDropsComputed: true }, [element('h2', { text: 'Live CSS image' })])
  ])]);
  const expected = withComputedStyle(() => extractStructuredPage(root, { excludedSelectors: 'nav', contentSelectors: 'article' }));
  const runtime = withComputedStyle(() => withRuntimePage(root, () => extractor('nav', 'article', 'body')));
  assert.deepEqual(expected.contentBlocks, [
    { type: 'image', imageUrl: 'https://cdn.example.test/live-only.jpg' }, { type: 'heading_2', text: 'Live CSS image' }
  ]);
  assert.deepEqual(runtime.contentBlocks, expected.contentBlocks);
});
