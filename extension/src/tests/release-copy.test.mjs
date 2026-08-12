import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

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
    'does not deliver automatically',
    'defaults to the local Archive',
    'no background or automatic sync',
    'explicitly select direct delivery during capture'
  ]) {
    assert.match(introduction, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
  for (const configurationClaim of ['Connect', 'Connection status', 'Save target mapping', 'Data source', 'Evidence template']) {
    const escaped = configurationClaim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.doesNotMatch(introduction, new RegExp(`\\b${escaped}\\b`, 'i'));
  }
  assert.doesNotMatch(introduction, /capture, local saving, and delivery remain separate actions/i);
  assert.match(readme, /docs\/project-introduction\.md/i);
});

test('project introduction uses verified Community side-panel crops and describes notes after Archive review', async () => {
  const root = new URL('../../../', import.meta.url);
  // These are the exact, visible Community UI strings in the supplied source screenshots.
  // The SHA-256 values pin each published PNG to its privacy-safe, deterministic side-panel crop.
  const suppliedScreenCrops = [
    {
      path: 'docs/assets/capture-panel.png',
      size: [448, 795],
      sha256: 'd56596eb314bdfc3404644ddb883a47894f928524bb74460ae66165db303ddae',
      strings: ['Evidence capture for Notion', 'Send to Notion', 'Selection', 'Alt + 1', 'Image area', 'Alt + 2', 'Full page', 'Alt + 3']
    },
    {
      path: 'docs/assets/connected-settings.png',
      size: [448, 825],
      sha256: '68e6c5c02b8d0c026a1ae170fb882eae252ebb925809689afd7f713c36d1a216',
      strings: ['Evidence capture for Notion', 'Send to Notion', 'Evidence sent to Notion.']
    },
    {
      path: 'docs/assets/field-mapping.png',
      size: [285, 400],
      sha256: '29a188be285a4b59b3a617e65e6992f8db5c78b320d1de629082e1c932188c97',
      strings: ['Name (title)', 'URL (url)', 'Do not map']
    }
  ];
  for (const crop of suppliedScreenCrops) {
    assert.ok(crop.strings.length >= 3, `${crop.path} must document its visible Community UI`);
    const bytes = await readFile(new URL(crop.path, root));
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${crop.path} must be a PNG`);
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], crop.size, `${crop.path} must retain the reviewed crop dimensions`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), crop.sha256, `${crop.path} must be the reviewed supplied-screen crop`);
  }

  const introduction = await readFile(new URL('docs/project-introduction.md', root), 'utf8');
  assert.match(introduction, /capture while reading[\s\S]*open the saved Archive record[\s\S]*add a personal note/i);
  assert.doesNotMatch(introduction, /capture[^\n.]*and add a personal note/i);
  assert.doesNotMatch(introduction, /current hosting and support|current features and pricing/i);
});
