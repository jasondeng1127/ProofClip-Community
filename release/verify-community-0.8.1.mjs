import { createHash } from 'node:crypto';
import { access, readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const KEY = (value) => String(value).split(/[\\/]/).join('/');
const REQUIRED_FILES = new Set([
  'extension/src/manifest.json',
  'extension/src/community-config.mjs',
  'worker/src/worker.mjs',
  'worker/src/schema.sql',
  'worker/migrations/20260813_privacy_nonretention.sql',
  'worker/scripts/bundle-worker.mjs',
  'worker/dist/worker.mjs',
  'deploy/deploy.ps1',
  'deploy/deploy.sh',
  'deploy/wrangler.template.jsonc',
  'docs/community-0.8.1-deployment.md',
  'README.md',
  'LICENSE',
  'SECURITY.md',
  'CONTRIBUTING.md',
  'TRADEMARKS.md',
  'MIGRATION.md',
]);

function isAllowedPath(path) {
  if (path === 'PROVENANCE.json') return true;
  if (REQUIRED_FILES.has(path)) return true;
  if (/^(?:extension\/src|worker\/src|worker\/migrations|worker\/scripts)\//.test(path)) return true;
  if (/^deploy\//.test(path) && !/(^|\/)(?:deploy\.env|\.dev\.vars(?:\.example)?|\.generated|\.state|node_modules)(?:\/|$)/.test(path)) return true;
  return /^(?:README\.md|LICENSE|SECURITY\.md|CONTRIBUTING\.md|TRADEMARKS\.md|MIGRATION\.md|docs\/community-0\.8\.1-deployment\.md)$/.test(path);
}

async function walkFiles(root) {
  const files = [];
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) files.push(full);
      else files.push(full);
    }
  }
  await visit(root);
  return files;
}

function finding(category, path) {
  return `CANDIDATE_PROVENANCE_FAILED category=${category} path=${path}`;
}

function fingerprint(files) {
  return sha256(Buffer.from(files.map((file) => `${file.path}:${file.sha256}`).join('\n'), 'utf8'));
}

const pathRules = [
  { pattern: /^(?:audit|runtime-evidence)\//i, category: 'AUDIT_OR_RUNTIME_EVIDENCE' },
  { pattern: /^(?:release|docs\/(?:acceptance|backlog|superpowers))\//i, category: 'RELEASE_OR_PLANNING_EVIDENCE' },
  { pattern: /(^|\/)\.wrangler\//i, category: 'WRANGLER_STATE' },
  { pattern: /^worker\/dist\/(?!worker\.mjs$)/i, category: 'GENERATED_RUNTIME_STATE' },
  { pattern: /^deploy\/(?:deploy\.env|\.dev\.vars(?:\.example)?|\.generated\/|\.state\/|node_modules\/)/i, category: 'LOCAL_DEPLOYMENT_STATE' },
];

const textRules = [
  { pattern: /proofclip-community-rc1-20260814/i, category: 'RC_IDENTITY' },
  { pattern: /proofclip-community-08-fresh-rehearsal-20260816/i, category: 'FRESH_REHEARSAL_IDENTITY' },
  { pattern: /fresh-oauth-transport-1/i, category: 'DIAGNOSTIC_IDENTITY' },
  { pattern: /cb077973-df64-49d4-90df-c0720b462f4f/i, category: 'DIAGNOSTIC_UUID' },
  { pattern: /(?:projects\/service\/P-proofclip-api|lemonsqueezy|support-issued\s+key|manual-subscription|\/v1\/(?:license|usage\/report|webhooks\/lemon))/i, category: 'COMMERCIAL_IDENTITY' },
  { pattern: /(?:FRESH_DEPLOY_PASS_FROZEN|CANDIDATE_HANDOFF_BLOCKED|RELEASE_IDENTITY|release-record)/i, category: 'AUDIT_RELEASE_EVIDENCE' },
  { pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i, category: 'PRIVATE_KEY_MATERIAL' },
  { pattern: /(?:CF_API_TOKEN|CLOUDFLARE_API_TOKEN|NOTION_CLIENT_SECRET|TOKEN_VAULT_KEY)\s*[:=]\s*[^\s"']+/i, category: 'SECRET_VALUE' },
  { pattern: /(?:access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|oauth[_ -]?state|authorization[_ -]?code)\s*[:=]\s*["']?(?!(?:ntn|nrt)_(?:test|realistic_test)|(?:client|secret|vault|token)[-_]?(?:secret|key|sentinel)|temporary[-_]code\b)[A-Za-z0-9._~+\/-]{12,}/i, category: 'OAUTH_SECRET' },
  { pattern: /\bBearer\s+[A-Za-z0-9._~+\/-]{16,}/i, category: 'AUTHORIZATION_TOKEN' },
  { pattern: /\b(?:secret_|ntn_|sk-)\w{10,}/i, category: 'SERVICE_SECRET' },
];

async function readPayload(candidateDir) {
  const payload = [];
  for (const file of await walkFiles(candidateDir)) {
    const path = KEY(relative(candidateDir, file));
    if (path === 'PROVENANCE.json') continue;
    const bytes = await readFile(file);
    payload.push({ path, sha256: sha256(bytes), bytes });
  }
  payload.sort((a, b) => a.path.localeCompare(b.path));
  return payload;
}

export async function verifyCommunity081Candidate({ candidateDir, expectedCommit, expectedFingerprint }) {
  const root = resolve(candidateDir);
  const findings = [];
  let provenance;
  try {
    await access(root);
    provenance = JSON.parse(await readFile(join(root, 'PROVENANCE.json'), 'utf8'));
  } catch {
    return { ok: false, findings: [finding('PROVENANCE_MISSING_OR_INVALID', 'PROVENANCE.json')], files: [], contentFingerprint: null };
  }

  const payload = await readPayload(root);
  const files = payload.map(({ path, sha256: fileHash }) => ({ path, sha256: fileHash }));
  const contentFingerprint = fingerprint(files);
  const actualPaths = new Set(files.map((file) => file.path));
  for (const required of REQUIRED_FILES) if (!actualPaths.has(required)) findings.push(finding('REQUIRED_FILE_MISSING', required));
  for (const file of payload) {
    if (!isAllowedPath(file.path)) findings.push(finding('UNALLOWLISTED_PATH', file.path));
    for (const rule of pathRules) if (rule.pattern.test(file.path)) findings.push(finding(rule.category, file.path));
    if (file.path === 'worker/dist/worker.mjs' && !actualPaths.has('worker/dist/worker.mjs')) findings.push(finding('BUNDLE_MISSING', file.path));
    if (file.path === 'worker/dist/worker.mjs' && files.filter((entry) => entry.path.startsWith('worker/dist/')).length !== 1) findings.push(finding('BUNDLE_SET_INVALID', file.path));
    let text;
    try {
      text = file.bytes.toString('utf8');
      if (text.includes('\uFFFD')) continue;
    } catch {
      continue;
    }
    for (const rule of textRules) if (rule.pattern.test(text)) findings.push(finding(rule.category, file.path));
  }

  const provenanceText = await readFile(join(root, 'PROVENANCE.json'), 'utf8');
  for (const rule of textRules) if (rule.pattern.test(provenanceText)) findings.push(finding(rule.category, 'PROVENANCE.json'));
  try {
    const manifest = JSON.parse((payload.find((file) => file.path === 'extension/src/manifest.json')?.bytes || '').toString('utf8'));
    if (typeof manifest.key !== 'string' || !manifest.key.trim()) findings.push(finding('STABLE_MANIFEST_KEY_MISSING', 'extension/src/manifest.json'));
  } catch {
    findings.push(finding('MANIFEST_INVALID', 'extension/src/manifest.json'));
  }

  if (provenance.schemaVersion !== 1 || provenance.candidateVersion !== '0.8.1') findings.push(finding('PROVENANCE_SCHEMA_INVALID', 'PROVENANCE.json'));
  if (provenance.sourceCommit !== expectedCommit) findings.push(finding('SOURCE_COMMIT_MISMATCH', 'PROVENANCE.json'));
  if (provenance.contentFingerprint !== contentFingerprint) findings.push(finding('CONTENT_FINGERPRINT_MISMATCH', 'PROVENANCE.json'));
  if (expectedFingerprint !== contentFingerprint) findings.push(finding('EXPECTED_FINGERPRINT_MISMATCH', 'PROVENANCE.json'));
  if (!Array.isArray(provenance.files) || JSON.stringify(provenance.files) !== JSON.stringify(files)) findings.push(finding('FILE_HASHES_MISMATCH', 'PROVENANCE.json'));
  if (provenance.bundle?.path !== 'worker/dist/worker.mjs' || provenance.bundle?.sourcePath !== 'worker/scripts/bundle-worker.mjs') findings.push(finding('BUNDLE_PROVENANCE_INVALID', 'PROVENANCE.json'));
  const bundle = files.find((file) => file.path === 'worker/dist/worker.mjs');
  if (bundle && provenance.bundle?.sha256 !== bundle.sha256) findings.push(finding('BUNDLE_HASH_MISMATCH', 'worker/dist/worker.mjs'));
  try {
    const sidecar = (await readFile(`${root}.sha256`, 'utf8')).trim().split(/\s+/)[0];
    if (sidecar !== contentFingerprint) findings.push(finding('SIDECAR_HASH_MISMATCH', 'candidate.sha256'));
  } catch {
    findings.push(finding('SIDECAR_MISSING', 'candidate.sha256'));
  }

  return { ok: findings.length === 0, findings, files, contentFingerprint };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const candidateArg = process.argv.find((arg) => arg.startsWith('--candidate='))?.slice('--candidate='.length);
  if (!candidateArg) throw new Error('usage: node release/verify-community-0.8.1.mjs --candidate=<path> --commit=<sha> --fingerprint=<sha>');
  const result = await verifyCommunity081Candidate({
    candidateDir: candidateArg,
    expectedCommit: process.argv.find((arg) => arg.startsWith('--commit='))?.slice('--commit='.length),
    expectedFingerprint: process.argv.find((arg) => arg.startsWith('--fingerprint='))?.slice('--fingerprint='.length),
  });
  if (!result.ok) {
    for (const item of result.findings) console.error(item);
    process.exitCode = 1;
  } else console.log(`Community 0.8.1 candidate verified: ${candidateArg}`);
}
