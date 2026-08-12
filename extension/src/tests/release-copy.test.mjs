import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('public Community documentation requires only deployer-owned services', async () => {
  const root = new URL('../../../', import.meta.url);
  const [readme, deployGuide, migration, architecture] = await Promise.all([
    readFile(new URL('README.md', root), 'utf8'),
    readFile(new URL('deploy/README.md', root), 'utf8'),
    readFile(new URL('MIGRATION.md', root), 'utf8'),
    readFile(new URL('docs/architecture.md', root), 'utf8')
  ]);
  for (const text of [readme, deployGuide]) {
    assert.match(text, /deployer-owned/i);
    assert.match(text, /Cloudflare Worker/i);
    assert.match(text, /D1/i);
    assert.match(text, /Notion OAuth/i);
    assert.doesNotMatch(text, /payment|subscription|license key|telemetry|official service/i);
  }
  assert.match(readme, /AGPL-3\.0-only/i);
  assert.match(migration, /public Community repository/i);
  assert.doesNotMatch(migration, /private bootstrap|not for public publication|D:\\网络赚钱/i);
  assert.match(architecture, /Deployer-owned Cloudflare Worker/i);
  assert.match(architecture, /Notion client secret remains a Worker secret/i);
});
