// Community 0.8 export pipeline (A2).
// Deterministic: same inputs => byte-identical output tree (no timestamps).
// Stages: copy upstream -> apply exclusions -> apply overlay -> apply transforms -> write PROVENANCE.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_BOUNDARY = join(HERE, 'edition-boundary.json');
const DEFAULT_OVERLAY = join(HERE, 'overlay');
const DEFAULT_OUT = join(HERE, 'out', 'community-0.8.0');

// Canonical output key: forward slashes on every platform.
const KEY = (p) => String(p).split(/[\\/]/).join('/');

export function sha256Text(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

async function walkFiles(root) {
  const files = [];
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) files.push(full);
    }
  }
  await visit(root);
  return files;
}

export const defaultGit = {
  revParse(repoRoot) { try { return execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; } },
  statusPorcelain(repoRoot) { try { return execFileSync('git', ['-C', repoRoot, 'status', '--porcelain'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString(); } catch { return null; } }
};

// The upstream worktree is an export input, not public artifact metadata. Keep
// only the immutable source identity in PROVENANCE.json so local paths and
// private workspace labels cannot affect the public output.
export function publicUpstreamIdentity(upstream) {
  const pin = upstream?.pin;
  if (!pin?.commit || !pin?.fingerprint) throw new Error('upstream pin is required for public provenance.');
  const publicPin = { commit: pin.commit, fingerprint: pin.fingerprint };
  if (typeof pin.pinnedAt === 'string' && pin.pinnedAt) publicPin.pinnedAt = pin.pinnedAt;
  return { pin: publicPin };
}

export function publicBoundaryIdentity(boundary) {
  return { ...boundary, upstream: publicUpstreamIdentity(boundary.upstream) };
}

// Fingerprint of the pinned upstream product inputs (exclusions applied).
export async function computeUpstreamFingerprint(upstreamRoot, boundary) {
  const entries = [];
  for (const root of boundary.roots) {
    const dir = join(upstreamRoot, root.upstream);
    const includes = root.includeOnly ? (p) => root.includeOnly.some((prefix) => p === prefix || p.startsWith(prefix + '/')) : () => true;
    const exclusions = boundary.exclusions[root.id] || [];
    for (const file of await walkFiles(dir)) {
      const key = KEY(relative(dir, file));
      if (!includes(key) || exclusions.includes(key)) continue;
      entries.push(root.output + '/' + key + ':' + sha256Text(await readFile(file, 'utf8')));
    }
  }
  entries.sort();
  return sha256Text(entries.join('\n'));
}

async function verifyUpstreamPin({ upstreamRoot, boundary, gitImpl = defaultGit }) {
  const pin = boundary.upstream?.pin;
  if (!pin?.commit || !pin?.fingerprint) {
    throw new Error('upstream must be pinned (edition-boundary.json upstream.pin { commit, fingerprint }); refusing to export from a moving upstream.');
  }
  const head = await gitImpl.revParse(upstreamRoot);
  if (head) {
    if (head !== pin.commit) throw new Error('upstream HEAD ' + head.slice(0, 12) + ' != pinned commit ' + pin.commit.slice(0, 12));
    const dirty = await gitImpl.statusPorcelain(upstreamRoot);
    if (dirty && dirty.trim()) throw new Error('upstream working tree is dirty; pin a committed state.');
    return 'git';
  }
  const fingerprint = await computeUpstreamFingerprint(upstreamRoot, boundary);
  if (fingerprint !== pin.fingerprint) {
    throw new Error('upstream fingerprint mismatch (git unavailable): pinned ' + pin.fingerprint.slice(0, 16) + ' != actual ' + fingerprint.slice(0, 16));
  }
  return 'fingerprint';
}

export async function createCommunityTree({ upstreamRoot, boundaryFile = DEFAULT_BOUNDARY, overlayDir = DEFAULT_OVERLAY, outDir = DEFAULT_OUT, writeOutput = true, gitImpl = defaultGit }) {
  const boundary = JSON.parse(await readFile(boundaryFile, 'utf8'));
  if (boundary.schemaVersion !== 1) throw new Error('Unsupported edition-boundary schema version.');
  if (boundary.edition !== 'community') throw new Error('Boundary is not the community edition.');
  const pinMode = await verifyUpstreamPin({ upstreamRoot, boundary, gitImpl });

  const overlayFiles = new Map();
  if (await stat(overlayDir).then(() => true).catch(() => false)) {
    for (const file of await walkFiles(overlayDir)) {
      overlayFiles.set(KEY(relative(overlayDir, file)), file);
    }
  }

  const plan = new Map(); // outputKey -> { output, source, content }
  const skipped = [];
  for (const root of boundary.roots) {
    const upstreamDir = join(upstreamRoot, root.upstream);
    const includes = root.includeOnly ? (p) => root.includeOnly.some((prefix) => p === prefix || p.startsWith(prefix + '/')) : () => true;
    const exclusions = boundary.exclusions[root.id] || [];
    for (const file of await walkFiles(upstreamDir)) {
      const key = KEY(relative(upstreamDir, file));
      if (!includes(key)) { skipped.push({ output: root.output + '/' + key, reason: 'outside includeOnly' }); continue; }
      if (exclusions.includes(key)) { skipped.push({ output: root.output + '/' + key, reason: 'excluded' }); continue; }
      const output = root.output + '/' + key;
      const overlaySource = overlayFiles.get(output);
      let content;
      let source;
      if (overlaySource) {
        content = await readFile(overlaySource, 'utf8');
        source = 'overlay';
      } else {
        content = await readFile(file, 'utf8');
        source = 'upstream';
        const transforms = boundary.transforms?.[output];
        if (Array.isArray(transforms)) {
          for (const t of transforms) {
            if (typeof t.from !== 'string' || typeof t.to !== 'string') throw new Error('transform entries must be {from,to} strings');
            if (!content.includes(t.from)) throw new Error('transform source not found in ' + output);
            content = content.split(t.from).join(t.to);
            source = source + '+transform';
          }
        }
      }
      plan.set(output, { output, source, content });
    }
  }

  // Overlay files that are not part of any upstream root are added verbatim.
  for (const [key, file] of overlayFiles) {
    if (plan.has(key)) continue;
    plan.set(key, { output: key, source: 'overlay', content: await readFile(file, 'utf8') });
  }

  const entries = [...plan.values()].sort((a, b) => a.output.localeCompare(b.output));

  const files = entries.map(({ output, source, content }) => ({ path: output, source, sha256: sha256Text(content) }));
  const publicUpstream = publicUpstreamIdentity(boundary.upstream);
  const provenance = {
    edition: boundary.edition,
    targetVersion: boundary.targetVersion,
    tool: 'release/export-community.mjs',
    boundarySha256: sha256Text(JSON.stringify(publicBoundaryIdentity(boundary))),
    upstream: publicUpstream,
    fileCount: files.length,
    skippedCount: skipped.length,
    buildArtifacts: [
      { path: 'worker/dist/worker.mjs', note: 'built at release cut time from the artifact source by worker/scripts/bundle-worker.mjs; intentionally not part of the source tree and excluded from the files list and from the commercial-boundary scan' }
    ],
    files
  };

  if (writeOutput) {
    await rm(outDir, { recursive: true, force: true });
    for (const { output, content } of entries) {
      const target = join(outDir, output);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content, 'utf8');
    }
    await writeFile(join(outDir, 'PROVENANCE.json'), JSON.stringify(provenance, null, 2) + '\n', 'utf8');
    // Tracked canonical copy so CI and the audit can verify provenance without
    // the gitignored staging tree. Written only for a real export (default outDir)
    // so test fixtures never touch it.
    if (resolve(outDir) === resolve(DEFAULT_OUT)) {
      const canonicalDir = join(HERE, 'provenance');
      await mkdir(canonicalDir, { recursive: true });
      await writeFile(join(canonicalDir, 'community-' + provenance.targetVersion + '.json'), JSON.stringify(provenance, null, 2) + '\n', 'utf8');
    }
  }
  return { provenance, skipped };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const upstreamArg = args.find((a) => a.startsWith('--upstream='))?.split('=')[1];
  const outArg = args.find((a) => a.startsWith('--out='))?.split('=')[1];
  const boundary = JSON.parse(await readFile(DEFAULT_BOUNDARY, 'utf8'));
  const upstreamRoot = upstreamArg || boundary.upstream.worktree;
  const outDir = outArg || DEFAULT_OUT;
  const { provenance, skipped } = await createCommunityTree({ upstreamRoot, outDir });
  console.log('Community ' + provenance.targetVersion + ' tree written to ' + outDir);
  console.log('files: ' + provenance.fileCount + ', skipped: ' + provenance.skippedCount);
  for (const item of skipped) console.log('  skip: ' + item.output + ' (' + item.reason + ')');
}
