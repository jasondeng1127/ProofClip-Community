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

test('project introduction leads with research and states the Community boundary', async () => {
  const root = new URL('../../../', import.meta.url);
  const [readme, introduction] = await Promise.all([
    readFile(new URL('README.md', root), 'utf8'),
    readFile(new URL('docs/project-introduction.md', root), 'utf8')
  ]);
  const researchHeading = introduction.indexOf('Literature and document research');
  const otherUseCases = introduction.indexOf('Other research use cases');
  assert.ok(researchHeading >= 0 && researchHeading < otherUseCases);
  for (const phrase of [
    'personal note',
    'Alt+1',
    'Alt+2',
    'Alt+3',
    'docs/assets/capture-panel.png',
    'docs/assets/connected-settings.png',
    'docs/assets/field-mapping.png',
    'local Archive',
    'explicitly',
    'Community edition vs Commercial edition',
    'published earlier-version baseline',
    'AGPL-3.0-only',
    'self-hosted',
    'no central ProofClip-hosted dependency',
    'commercial offering',
    'more complete feature set',
    'more polished experience',
    'continuing version updates',
    'self-deploy and operate it themselves',
    'source URL',
    'capture time',
    'projects',
    'tags',
    'search',
    'editable templates',
    'Outbox recovery',
    'does not deliver automatically'
  ]) {
    assert.match(introduction, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
  for (const configurationClaim of ['Connect', 'Connection status', 'Save target mapping', 'Data source', 'Evidence template', 'Field mapping']) {
    const escaped = configurationClaim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.doesNotMatch(introduction, new RegExp(`\\b${escaped}\\b`, 'i'));
  }
  assert.match(readme, /docs\/project-introduction\.md/i);
});
