// CI release gates for .github/workflows/release-readiness.yml.
// One implementation: the same git checks and tag policy as release-audit.
//   node release/ci-release-gates.mjs [--remote-url <url>] [--with-clone-smoke]
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultGit, versionTagPolicy } from './release-audit.mjs';
import { verifyClonedTree } from './verify-cloned-tree.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

function run(cmd, args, cwd = ROOT) {
  try { return execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString(); }
  catch { return null; }
}

async function main() {
  const args = process.argv.slice(2);
  const remoteUrl = args.find((a) => a.startsWith('--remote-url='))?.split('=').slice(1).join('=');
  const withCloneSmoke = args.includes('--with-clone-smoke');
  const findings = [];

  const version = JSON.parse(await import('node:fs/promises').then((m) => m.readFile(join(ROOT, 'extension/src/manifest.json'), 'utf8'))).version;

  // Default branch == main.
  const symref = run('git', ['ls-remote', '--symref', 'origin', 'HEAD']);
  if (!symref || !/ref: refs\/heads\/main\s+HEAD/.test(symref)) findings.push('DEFAULT_BRANCH_SOURCE_MISMATCH: origin HEAD does not point at refs/heads/main');
  else console.log('default branch: main (PASS)');

  // Tag policy at HEAD (release-ready tag must match v<version>[-rcN]).
  const head = defaultGit.revParse(ROOT);
  const tags = head ? run('git', ['tag', '--points-at', head]) : null;
  const policy = versionTagPolicy(version);
  const policyTags = (tags || '').split(/\r?\n/).map((t) => t.trim()).filter(Boolean).filter((t) => policy.test(t));
  if (!policyTags.length) findings.push('TAG_POLICY_FAIL: no tag matching v' + version + '[-rcN] at HEAD' + (tags ? ' (got: ' + tags.trim() + ')' : ''));
  else console.log('tag policy: ' + policyTags[0] + ' (PASS)');

  // Tag commit must descend from main.
  if (policyTags.length) {
    const tagCommit = run('git', ['rev-parse', policyTags[0] + '^{commit}']);
    const fetched = run('git', ['fetch', 'origin', 'main']);
    const ancestor = tagCommit ? run('git', ['merge-base', '--is-ancestor', tagCommit, 'origin/main']) : null;
    if (!tagCommit || ancestor === null) findings.push('RELEASE_TAG_MUST_DESCEND_FROM_MAIN: tag ' + policyTags[0] + ' commit is not an ancestor of origin/main');
    else console.log('tag ancestry: ' + policyTags[0] + ' descends from main (PASS)');
  }

  // Fresh clone smoke (optional; needs network).
  if (withCloneSmoke && remoteUrl) {
    const cloneDir = await mkdtemp(join(tmpdir(), 'proofclip-ci-clone-'));
    try {
      run('git', ['clone', '--depth', '1', remoteUrl, cloneDir]);
      const result = verifyClonedTree(cloneDir, { expectedVersion: version });
      if (!result.ok) for (const f of result.findings) findings.push(f);
      else console.log('clone smoke: PASS (fresh clone yields ' + version + ')');
    } catch (error) { findings.push('clone smoke failed: ' + (error?.message || String(error))); }
    finally { await rm(cloneDir, { recursive: true, force: true }).catch(() => {}); }
  }

  if (findings.length) {
    for (const f of findings) console.log('FINDING: ' + f);
    process.exit(1);
  }
  console.log('CI_RELEASE_GATES = PASS');
  process.exit(0);
}

main();
