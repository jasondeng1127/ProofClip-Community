import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('archive card renders delivery actions and properties before body preview', async () => {
  const [js, css] = await Promise.all([
    readFile(new URL('../archive.js', import.meta.url), 'utf8'),
    readFile(new URL('../archive.css', import.meta.url), 'utf8')
  ]);

  // card-properties section exists in both JS and CSS
  assert.match(js, /card-properties/);
  assert.match(css, /\.card-properties\s*\{/);

  // Delivery actions append precedes properties append, which precedes body excerpt append
  const delivIdx = js.indexOf('article.append(deliveryActions');
  const propIdx = js.indexOf('article.append(properties)');
  const excerptIdx = js.indexOf("article.append(excerpt)");
  assert.ok(delivIdx >= 0, 'deliveryActions is appended to the article');
  assert.ok(propIdx >= 0, 'properties section is appended to the article');
  assert.ok(excerptIdx >= 0, 'body excerpt is appended to the article');
  assert.ok(delivIdx < propIdx, 'delivery actions are appended before properties');
  assert.ok(propIdx < excerptIdx, 'properties are appended before body excerpt');

  // Properties section has the required aria-label and heading
  assert.match(js, /'aria-label',\s*'Evidence properties'/);
  assert.match(js, /propsHeading\.textContent = 'Properties'/);

  // Warning is appended after properties but before excerpt
  const warningIdx = js.indexOf("article.append(warning)");
  assert.ok(warningIdx >= 0, 'truncation warning is appended');
  assert.ok(propIdx < warningIdx, 'properties are appended before truncation warning');
  assert.ok(warningIdx < excerptIdx, 'truncation warning is appended before body excerpt');

  // Feedback is appended after deliveryActions but before properties
  const feedbackIdx = js.indexOf('article.append(deliveryActions, feedback)');
  assert.ok(feedbackIdx >= 0, 'deliveryActions and feedback are appended together');
  assert.ok(feedbackIdx < propIdx, 'feedback is appended before properties');

  // card-properties CSS rule includes margin and border styles
  assert.match(css, /card-properties.*margin-top/);
  assert.match(css, /card-properties.*border-top/);

  // UX 028: full body text is shown in a scrollable excerpt
  assert.match(js, /excerpt\.textContent = card\.bodyText;/);
  assert.doesNotMatch(js, /bodyText\.slice\(0, 500\)/);
  assert.match(css, /\.excerpt.*max-height:12em/);
  assert.match(css, /\.excerpt.*overflow-y:auto/);
});
