import assert from 'node:assert/strict';
import test from 'node:test';
import { deliveryLinkState } from '../core/notion-link.mjs';

test('accepts HTTPS Notion page URLs for popup success links', () => {
  assert.deepEqual(deliveryLinkState('https://www.notion.so/My-page-abc123'), {
    visible: true,
    href: 'https://www.notion.so/My-page-abc123'
  });
  assert.deepEqual(deliveryLinkState('https://app.notion.com/p/example'), {
    visible: true,
    href: 'https://app.notion.com/p/example'
  });
});

test('clears delivery link state for absent or unsafe URLs', () => {
  for (const value of ['', 'http://www.notion.so/page', 'https://notion.so.evil.example/page', 'https://example.com/page']) {
    assert.deepEqual(deliveryLinkState(value), { visible: false, href: '' });
  }
});
