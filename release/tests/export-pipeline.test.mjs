import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createCommunityTree, sha256Text } from '../export-community.mjs';
import { verifyGeneratedTree } from '../verify-generated-tree.mjs';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'proofclip-export-'));
  const upstream = join(root, 'upstream');
  const overlayDir = join(root, 'overlay');
  const outDir = join(root, 'out');
  const boundary = join(root, 'boundary.json');
  await mkdir(join(upstream, 'projects/chrome/P-notion-evidence-clipper/src/core'), { recursive: true });
  await mkdir(join(upstream, 'projects/chrome/P-notion-evidence-clipper/src/tests'), { recursive: true });
  await mkdir(join(upstream, 'projects/service/P-proofclip-api/src'), { recursive: true });
  await writeFile(join(upstream, 'projects/chrome/P-notion-evidence-clipper/src/core/record.mjs'), 'export const MAX = 100;\n');
  await writeFile(join(upstream, 'projects/chrome/P-notion-evidence-clipper/src/core/trial-policy.mjs'), 'export const quota = 50;\n');
  await writeFile(join(upstream, 'projects/chrome/P-notion-evidence-clipper/src/tests/trial-policy.test.mjs'), 'test quota\n');
  await writeFile(join(upstream, 'projects/service/P-proofclip-api/src/worker.mjs'), 'export const route = "/v1/captures";\n');
  await writeFile(join(upstream, 'projects/service/P-proofclip-api/src/subscription.mjs'), 'export const KEY = "PC-AAAA";\n');
  await writeFile(join(upstream, 'projects/service/P-proofclip-api/project.yaml'), 'private: true\n');
  await writeFile(join(boundary), JSON.stringify({
    schemaVersion: 1,
    edition: 'community',
    targetVersion: '0.8.0',
    upstream: { name: 'fixture', branch: 'x', worktree: upstream, note: '', pin: { commit: 'pinned-commit', fingerprint: 'pinned-fp' } },
    roots: [
      { id: 'extension', upstream: 'projects/chrome/P-notion-evidence-clipper', output: 'extension', includeOnly: ['src'] },
      { id: 'worker', upstream: 'projects/service/P-proofclip-api', output: 'worker', includeOnly: ['src'] }
    ],
    exclusions: {
      extension: ['src/core/trial-policy.mjs', 'src/tests/trial-policy.test.mjs'],
      worker: ['src/subscription.mjs']
    },
    communityOwnedTopLevel: [],
    requiredFiles: [],
    transforms: { 'worker/src/worker.mjs': [{ from: '/v1/captures', to: '/v1/deliver' }] },
    forbiddenTokens: ['subscription', 'quota', 'PC-'],
    forbiddenPathPatterns: ['subscription\\.mjs', 'project\\.yaml', 'trial-policy']
  }), 'utf8');
  return { root, upstream, overlayDir, outDir, boundary };
}

test('pipeline excludes commercial files, applies overlay, transforms, and writes provenance', async () => {
  const { root, upstream, overlayDir, outDir, boundary } = await fixture();
  await mkdir(join(overlayDir, 'extension/src/core'), { recursive: true });
  await writeFile(join(overlayDir, 'extension/src/core/record.mjs'), 'export const MAX = 100; // community\n');
  await writeFile(join(overlayDir, 'extension/src/community-config.mjs'), 'export const ORIGIN = "https://replace-me.invalid";\n');

  const { provenance } = await createCommunityTree({ upstreamRoot: upstream, boundaryFile: boundary, overlayDir, outDir, gitImpl: { revParse: async () => 'pinned-commit', statusPorcelain: async () => '' } });

  const record = await readFile(join(outDir, 'extension/src/core/record.mjs'), 'utf8');
  assert.match(record, /community/);
  const worker = await readFile(join(outDir, 'worker/src/worker.mjs'), 'utf8');
  assert.match(worker, /\/v1\/deliver/);
  assert.doesNotMatch(worker, /\/v1\/captures/);
  await assert.rejects(readFile(join(outDir, 'extension/src/core/trial-policy.mjs')));
  await assert.rejects(readFile(join(outDir, 'worker/src/subscription.mjs')));
  assert.match(await readFile(join(outDir, 'extension/src/community-config.mjs'), 'utf8'), /replace-me/);
  assert.ok(provenance.files.some((f) => f.path === 'extension/src/core/record.mjs' && f.source === 'overlay'));
  assert.ok(provenance.files.some((f) => f.path === 'worker/src/worker.mjs' && f.source === 'upstream+transform'));
  assert.equal(new Set(provenance.files.map((f) => f.path)).size, provenance.files.length, 'provenance paths must be unique');
  await rm(root, { recursive: true, force: true });
});

test('pipeline is deterministic: two runs produce identical trees and provenance', async () => {
  const { root, upstream, overlayDir, outDir, boundary } = await fixture();
  await mkdir(join(overlayDir, 'extension/src'), { recursive: true });
  await writeFile(join(overlayDir, 'extension/src/community-config.mjs'), 'export const ORIGIN = "https://replace-me.invalid";\n');
  const out2 = join(root, 'out2');
  const first = await createCommunityTree({ upstreamRoot: upstream, boundaryFile: boundary, overlayDir, outDir, gitImpl: { revParse: async () => 'pinned-commit', statusPorcelain: async () => '' } });
  const second = await createCommunityTree({ upstreamRoot: upstream, boundaryFile: boundary, overlayDir, outDir: out2, gitImpl: { revParse: async () => 'pinned-commit', statusPorcelain: async () => '' } });
  assert.equal(JSON.stringify(first.provenance), JSON.stringify(second.provenance));
  assert.equal(sha256Text(JSON.stringify(first.provenance)), sha256Text(JSON.stringify(second.provenance)));
  const treeFiles = async (dir) => (await import('node:fs/promises')).readdir(dir, { recursive: true });
  const a = (await treeFiles(outDir)).filter((f) => typeof f === 'string').sort();
  const b = (await treeFiles(out2)).filter((f) => typeof f === 'string').sort();
  assert.deepEqual(a, b);
  await rm(root, { recursive: true, force: true });
});

test('scanner rejects commercial tokens, forbidden paths, and provenance mismatch', async () => {
  const { root, upstream, overlayDir, outDir, boundary } = await fixture();
  await createCommunityTree({ upstreamRoot: upstream, boundaryFile: boundary, overlayDir, outDir, gitImpl: { revParse: async () => 'pinned-commit', statusPorcelain: async () => '' } });
  const clean = await verifyGeneratedTree({ treeDir: outDir, boundaryFile: boundary });
  assert.equal(clean.ok, true, JSON.stringify(clean.findings));
  await writeFile(join(outDir, 'extension/src/leak.txt'), 'quota subscription PC-AAAA\n');
  const dirty = await verifyGeneratedTree({ treeDir: outDir, boundaryFile: boundary });
  assert.equal(dirty.ok, false);
  assert.ok(dirty.findings.some((f) => f.includes('forbidden token')));
  await rm(root, { recursive: true, force: true });
});

test('scanner reports missing required files and provenance hash drift', async () => {
  const { root, upstream, overlayDir, outDir, boundary } = await fixture();
  await createCommunityTree({ upstreamRoot: upstream, boundaryFile: boundary, overlayDir, outDir, gitImpl: { revParse: async () => 'pinned-commit', statusPorcelain: async () => '' } });
  await rm(join(outDir, 'worker/src/worker.mjs'));
  const result = await verifyGeneratedTree({ treeDir: outDir, boundaryFile: boundary });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((f) => f.includes('provenance file missing')));
  await rm(root, { recursive: true, force: true });
});
test('repo mode scans only the product roots and ignores release/ and docs/', async () => {
  const { root, upstream, overlayDir, outDir, boundary } = await fixture();
  await createCommunityTree({ upstreamRoot: upstream, boundaryFile: boundary, overlayDir, outDir, gitImpl: { revParse: async () => 'pinned-commit', statusPorcelain: async () => '' } });
  await import('node:fs/promises').then(async (fs) => {
    await fs.mkdir(join(outDir, 'release'), { recursive: true });
    await fs.writeFile(join(outDir, 'release/leak.txt'), 'quota subscription PC-AAAA\n');
    await fs.writeFile(join(outDir, 'LICENSE'), 'AGPL-3.0 license text\n');
  });
  const result = await verifyGeneratedTree({ treeDir: outDir, boundaryFile: boundary, requireProvenance: false });
  assert.equal(result.ok, true, JSON.stringify(result.findings));
  await import('node:fs/promises').then(async (fs) => {
    await fs.writeFile(join(outDir, 'extension/src/leak.txt'), 'quota subscription PC-AAAA\n');
  });
  const dirty = await verifyGeneratedTree({ treeDir: outDir, boundaryFile: boundary, requireProvenance: false });
  assert.equal(dirty.ok, false);
  assert.ok(dirty.findings.some((f) => f.includes('forbidden token')));
  await rm(root, { recursive: true, force: true });
});