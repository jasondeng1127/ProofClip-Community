import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { access, cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

import { createCloudflareClient } from './lib/cloudflare-api.mjs';
import { assertDeployEnvShape } from './lib/env.mjs';
import { DeployError, redactText, registerRedactionSecret } from './lib/errors.mjs';
import { decodeManifestKey, deriveExtensionId } from './lib/identity.mjs';
import { buildNotionRedirectUri, normalizeHttpsOrigin } from './lib/origin.mjs';
import { resolveDeploymentResources } from './lib/ownership.mjs';
import { createStagingTree } from './lib/staging.mjs';
import { createWranglerRunner } from './lib/wrangler.mjs';

const execFileAsync = promisify(execFile);
const MODULE_PATH = fileURLToPath(import.meta.url);
const WORKER_NAME = 'proofclip-community';
const D1_NAME = 'proofclip-community';
const VERSION = '0.8.1';
const MARKER = 'community-0.8.1';
const CANONICAL_STATE_PATH = 'deploy/.state/deployment-state.json';
const STABLE_EXTENSION_ID = 'ecpbgjlelajodnnichnflkcjkhojfekl';
const STABLE_MANIFEST_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoE6clBamwq6eJy+8TWYYbrDkUwCOB8b0X3sN7y67BY/qfHsNEgSNgLRsdE7EK+kaQRI1hr0cCRizkmDypEpEuL3YqNsgXI2nZMJjO9uRKirPLhi78vWybVc1EDVhl6gGqftg6rbWPHvlhx2SCMoUknpZ7q+d5eM0TPqF6F3SEFURA7SHyKTuSbTURrQbGfqkVwNukH5vWyojDKQW5Sk3r5ixI//5nxQOC+d5+rkutrd0hkZFEEus+Ty54Y/7u1CrVT7zjLH0Qw8xZ7ajnwHaZe2RFpVZMCPn+9y4EZvieXAmN/j048HPCEg0HFcTFTIfrGLRHGASorE8nPWcFb/AkQIDAQAB';
const REQUIRED_FILES = [
  'extension/src/manifest.json',
  'worker/src/worker.mjs',
  'worker/src/index.mjs',
  'worker/src/schema.sql',
  'worker/migrations/20260813_privacy_nonretention.sql',
  'worker/scripts/bundle-worker.mjs',
  'deploy/wrangler.template.jsonc'
];
const ENVIRONMENT_IDENTITY = /(?:https:\/\/[^\s"'<>]+\.workers\.dev|chrome-extension:\/\/[a-p]{32}|(?:CF_ACCOUNT_ID|CLOUDFLARE_ACCOUNT_ID|D1_DATABASE_ID|WORKER_ID)\s*=\s*[A-Za-z0-9_-]{4,})/i;
const STAGED_ROOTS = ['extension/src', 'worker/src', 'worker/migrations', 'worker/scripts'];
const FORBIDDEN_SEGMENTS = new Set([
  'audit',
  '.audit',
  '.wrangler',
  'runtime',
  'runtime-evidence',
  'local-runtime',
  'legacy',
  'legacy-artifacts',
  'artifact',
  'artifacts',
  'release-record',
  'release-records'
]);

const defaultFs = { readFile, writeFile, mkdir, rm, cp, readdir, access, stat };

function fail(code, message, details = {}) {
  throw new DeployError(code, redactText(message), details);
}

function requiredText(name, value) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name} must be a non-empty string`);
  return value;
}

function normalizeRelative(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

function pathWithin(root, target) {
  const rootPath = resolve(root);
  const targetPath = resolve(target);
  const prefix = rootPath.endsWith(sep) ? rootPath : `${rootPath}${sep}`;
  return targetPath === rootPath || targetPath.startsWith(prefix);
}

function textValue(value) {
  return Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
}

async function exists(fsImpl, path) {
  try {
    if (typeof fsImpl.access === 'function') await fsImpl.access(path);
    else await fsImpl.stat(path);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(fsImpl, root, current = root, result = []) {
  if (typeof fsImpl.readdir !== 'function') return result;
  let entries;
  try {
    entries = await fsImpl.readdir(current, { withFileTypes: true });
  } catch {
    fail('CANDIDATE_PROVENANCE_FAILED', 'The candidate tree could not be scanned safely.');
  }
  for (const entry of entries) {
    const path = join(current, entry.name);
    const relativePath = normalizeRelative(relative(root, path));
    if (entry.isDirectory?.()) {
      if (isForbiddenCandidatePath(relativePath)) fail('CANDIDATE_PROVENANCE_FAILED', 'The candidate contains a forbidden release or environment identity.');
      await walkFiles(fsImpl, root, path, result);
    } else if (entry.isFile?.() || !entry.isDirectory) {
      result.push({ path, relativePath });
    }
  }
  return result;
}

function isForbiddenCandidatePath(relativePath) {
  const normalized = normalizeRelative(relativePath).toLowerCase();
  const segments = normalized.split('/').filter(Boolean);
  const fileName = segments.at(-1) || '';
  if (segments.some((segment) => FORBIDDEN_SEGMENTS.has(segment))) return true;
  if (segments.includes('release') && ['records', 'artifacts', 'tmp'].includes(segments[segments.indexOf('release') + 1])) return true;
  if (/^proofclip-community-rc\d+(?:[-_.]|$)/i.test(fileName)) return true;
  if (/(?:^|[-_.])rc\d+(?:[-_.]|$)/i.test(fileName)) return true;
  if (/\.zip$/i.test(fileName)) return true;
  if (/^(?:(?:proofclip-community|community)[-_.])?v?0\.8\.\d+(?:[-_.]|$)/i.test(fileName)) return true;
  if (/^(?:current[-_.])?release(?:[-_.]|$)/i.test(fileName)) return true;
  if (/^copying[-_.]manifest(?:[-_.]|$)/i.test(fileName)) return true;
  if (/^(?:release[-_.])?record(?:s)?(?:[-_.]|$)/i.test(fileName)) return true;
  if (/^audit[-_.]/i.test(fileName)) return true;
  if (/^(?:commercial|fresh|diagnostic)(?:[-_.]|$)/i.test(fileName)) return true;
  return false;
}

function parseEnvText(content) {
  const values = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const equals = line.indexOf('=');
    if (equals === -1) continue;
    const key = line.slice(0, equals).trim();
    let value = line.slice(equals + 1);
    if (value.startsWith('"') && !value.endsWith('"')) fail('DEPLOY_ENV_INVALID', 'Deploy environment values cannot span multiple lines.');
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.includes('\r') || value.includes('\n')) fail('DEPLOY_ENV_INVALID', 'Deploy environment values cannot contain newlines.');
    values[key] = value;
  }
  return values;
}

async function trackedDeployEnv({ repoRoot, fsImpl }) {
  if (typeof fsImpl.gitFiles === 'function') {
    const files = await fsImpl.gitFiles();
    return files.map(normalizeRelative).includes('deploy/deploy.env');
  }
  try {
    const result = await execFileAsync('git', ['-C', repoRoot, 'ls-files', '--error-unmatch', '--', 'deploy/deploy.env'], { windowsHide: true });
    return textValue(result.stdout).trim() === 'deploy/deploy.env';
  } catch {
    return false;
  }
}

async function loadEnvironment({ repoRoot, envPath, fsImpl }) {
  if (await trackedDeployEnv({ repoRoot, fsImpl })) fail('DEPLOY_ENV_TRACKED', 'deploy.env is tracked and cannot contain deployment credentials.');
  let content;
  try {
    content = await fsImpl.readFile(envPath, 'utf8');
  } catch {
    fail('DEPLOY_ENV_MISSING', 'deploy.env is missing.');
  }
  let values;
  try {
    values = parseEnvText(textValue(content));
  } catch (error) {
    if (error instanceof DeployError) throw error;
    fail('DEPLOY_ENV_INVALID', 'deploy.env is invalid.');
  }
  try {
    return assertDeployEnvShape(values);
  } catch (error) {
    if (error instanceof DeployError) {
      if (error.code === 'DEPLOY_ENV_MISSING' && error.details?.missing?.some((key) => key.startsWith('NOTION_'))) {
        fail('NOTION_CREDENTIALS_MISSING', 'The Notion deployment credentials are missing.');
      }
      throw error;
    }
    fail('DEPLOY_ENV_INVALID', 'deploy.env is invalid.');
  }
}

function parseCliArgs(args) {
  if (
    !Array.isArray(args)
    || args.length !== 2
    || args[0] !== '--env'
    || typeof args[1] !== 'string'
    || args[1].trim() === ''
    || args[1].startsWith('-')
  ) {
    fail('DEPLOYMENT_ARGS_INVALID', 'Deployment arguments are invalid.');
  }
  return args[1];
}

async function validateCandidate({ repoRoot, envPath, fsImpl }) {
  const root = resolve(requiredText('repoRoot', repoRoot));
  const envRelative = pathWithin(root, envPath) ? normalizeRelative(relative(root, envPath)) : null;
  const files = await walkFiles(fsImpl, root);
  for (const { relativePath, path } of files) {
    if (relativePath === envRelative) continue;
    if (isForbiddenCandidatePath(relativePath)) fail('CANDIDATE_PROVENANCE_FAILED', 'The candidate contains a forbidden release or environment identity.');
    if (relativePath.endsWith('.env') || relativePath.endsWith('.dev.vars')) {
      fail('CANDIDATE_PROVENANCE_FAILED', 'The candidate contains an environment file.');
    }
    if (relativePath.includes('node_modules')) continue;
    let content;
    try { content = textValue(await fsImpl.readFile(path, 'utf8')); } catch { continue; }
    if (ENVIRONMENT_IDENTITY.test(content)) fail('CANDIDATE_PROVENANCE_FAILED', 'The candidate contains an environment-specific identity.');
  }

  for (const requiredFile of REQUIRED_FILES) {
    const path = join(root, ...requiredFile.split('/'));
    if (!await exists(fsImpl, path)) fail('CANDIDATE_PROVENANCE_FAILED', `The candidate is missing a required deployment file: ${requiredFile}.`);
  }

  let manifest;
  try { manifest = JSON.parse(textValue(await fsImpl.readFile(join(root, 'extension', 'src', 'manifest.json'), 'utf8'))); } catch { fail('CANDIDATE_PROVENANCE_FAILED', 'The candidate manifest is invalid.'); }
  if (manifest.manifest_version !== 3 || manifest.version !== VERSION || typeof manifest.key !== 'string') {
    fail('CANDIDATE_PROVENANCE_FAILED', 'The candidate manifest is not the Community 0.8.1 manifest.');
  }
  let extensionId;
  try {
    decodeManifestKey(manifest.key);
    extensionId = deriveExtensionId(manifest.key);
  } catch { fail('CANDIDATE_PROVENANCE_FAILED', 'The candidate manifest key is invalid.'); }
  if (manifest.key !== STABLE_MANIFEST_KEY) fail('CANDIDATE_PROVENANCE_FAILED', 'The candidate manifest key does not match the fixed Community public identity.');
  if (extensionId !== STABLE_EXTENSION_ID) fail('CANDIDATE_PROVENANCE_FAILED', 'The candidate manifest key does not match the stable Community identity.');

  const identityFiles = files
    .filter(({ relativePath }) => STAGED_ROOTS.some((stagedRoot) => relativePath === stagedRoot || relativePath.startsWith(`${stagedRoot}/`)) || relativePath === 'deploy/wrangler.template.jsonc')
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
    .map(({ path }) => path);
  const hash = createHash('sha256');
  for (const file of identityFiles) {
    hash.update(normalizeRelative(relative(root, file))).update('\0');
    hash.update(await fsImpl.readFile(file));
    hash.update('\0');
  }
  const candidateSha256 = hash.digest('hex');
  const candidateCommit = await readCandidateCommit({ root, fsImpl });
  return { root, extensionId, candidateCommit, candidateSha256 };
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function isDeploymentStateFile(relativePath) {
  const normalized = normalizeRelative(relativePath);
  return normalized === CANONICAL_STATE_PATH;
}

async function validateCandidateIntegrity({ candidate, statePath, fsImpl }) {
  try {
    const root = candidate.root;
    const stateRelativePath = pathWithin(root, statePath) ? normalizeRelative(relative(root, statePath)) : null;
    if (stateRelativePath && stateRelativePath !== CANONICAL_STATE_PATH) {
      fail('DEPLOYMENT_STATE_INVALID', 'The deployment state path must use the canonical candidate-relative location.');
    }
    const provenance = JSON.parse(textValue(await fsImpl.readFile(join(root, 'PROVENANCE.json'), 'utf8')));
    if (
      provenance?.schemaVersion !== 1
      || provenance?.edition !== 'community'
      || provenance?.targetVersion !== VERSION
      || provenance?.candidateVersion !== VERSION
      || !/^[0-9a-f]{40}$/i.test(String(provenance?.sourceCommit || ''))
      || provenance.sourceCommit !== candidate.candidateCommit
    ) {
      fail('CANDIDATE_PROVENANCE_FAILED', 'The candidate provenance identity is invalid.');
    }

    const files = [];
    for (const file of await walkFiles(fsImpl, root)) {
      // Deployment state is generated after health succeeds and is not candidate content.
      if (file.relativePath === 'PROVENANCE.json' || isDeploymentStateFile(file.relativePath)) continue;
      const bytes = await fsImpl.readFile(file.path);
      files.push({ path: file.relativePath, sha256: sha256Bytes(bytes) });
    }
    files.sort((left, right) => left.path.localeCompare(right.path));
    if (!Array.isArray(provenance.files) || JSON.stringify(provenance.files) !== JSON.stringify(files)) {
      fail('CANDIDATE_PROVENANCE_FAILED', 'The candidate provenance file list or file hash is invalid.');
    }

    const contentFingerprint = sha256Bytes(Buffer.from(files.map((file) => `${file.path}:${file.sha256}`).join('\n'), 'utf8'));
    if (provenance.contentFingerprint !== contentFingerprint) {
      fail('CANDIDATE_PROVENANCE_FAILED', 'The candidate content fingerprint is invalid.');
    }

    const bundle = files.find((file) => file.path === 'worker/dist/worker.mjs');
    if (
      provenance.bundle?.path !== 'worker/dist/worker.mjs'
      || provenance.bundle?.sourcePath !== 'worker/scripts/bundle-worker.mjs'
      || !bundle
      || provenance.bundle?.sha256 !== bundle.sha256
    ) {
      fail('CANDIDATE_PROVENANCE_FAILED', 'The candidate Worker bundle provenance is invalid.');
    }

    const sidecarText = textValue(await fsImpl.readFile(`${root}.sha256`, 'utf8'));
    const sidecar = /^([0-9a-f]{64})  ([^\s\r\n]+)\n$/.exec(sidecarText);
    if (!sidecar || sidecar[1] !== contentFingerprint || sidecar[2] !== basename(root)) {
      fail('CANDIDATE_PROVENANCE_FAILED', 'The candidate provenance sidecar is invalid.');
    }
  } catch (error) {
    if (error instanceof DeployError) throw error;
    fail('CANDIDATE_PROVENANCE_FAILED', 'The candidate provenance integrity record is missing or invalid.');
  }
}

async function readCandidateCommit({ root, fsImpl }) {
  const gitCommit = await readGitCommit({ root, fsImpl });
  if (gitCommit) return gitCommit;
  try {
    const provenance = JSON.parse(textValue(await fsImpl.readFile(join(root, 'PROVENANCE.json'), 'utf8')));
    if (
      provenance?.edition !== 'community'
      || provenance?.targetVersion !== VERSION
      || !/^[0-9a-f]{40}$/i.test(provenance?.sourceCommit || '')
    ) {
      fail('CANDIDATE_PROVENANCE_FAILED', 'The candidate 0.8.1 provenance source commit is invalid.');
    }
    return provenance.sourceCommit;
  } catch (error) {
    if (error instanceof DeployError) throw error;
    fail('CANDIDATE_PROVENANCE_FAILED', 'The candidate 0.8.1 provenance record is missing or invalid.');
  }
}

async function readGitCommit({ root, fsImpl }) {
  if (typeof fsImpl.gitCommit === 'function') {
    try {
      const injected = textValue(await fsImpl.gitCommit(root)).trim();
      if (/^[0-9a-f]{40}$/i.test(injected)) return injected;
    } catch { /* fall through to the local Git and filesystem readers */ }
  }
  try {
    const result = await execFileAsync('git', ['-C', root, 'rev-parse', '--verify', 'HEAD'], { windowsHide: true });
    const head = textValue(result.stdout).trim();
    if (/^[0-9a-f]{40}$/i.test(head)) return head;
  } catch { /* exported candidates may not be Git worktrees */ }

  try {
    const gitMarker = textValue(await fsImpl.readFile(join(root, '.git'), 'utf8')).trim();
    const gitDir = gitMarker.startsWith('gitdir:') ? resolve(root, gitMarker.slice(7).trim()) : join(root, '.git');
    const head = textValue(await fsImpl.readFile(join(gitDir, 'HEAD'), 'utf8')).trim();
    if (/^[0-9a-f]{40}$/i.test(head)) return head;
    if (head.startsWith('ref: ')) {
      const ref = head.slice(5).trim();
      const refCandidates = [join(gitDir, ref)];
      let commonDir = gitDir;
      try {
        const commondir = textValue(await fsImpl.readFile(join(gitDir, 'commondir'), 'utf8')).trim();
        if (commondir) {
          commonDir = resolve(gitDir, commondir);
          refCandidates.push(join(commonDir, ref));
        }
      } catch { /* a normal repository keeps refs in its own .git directory */ }
      for (const refPath of refCandidates) {
        try {
          const value = textValue(await fsImpl.readFile(refPath, 'utf8')).trim();
          if (/^[0-9a-f]{40}$/i.test(value)) return value;
        } catch { /* try the next ref location or packed-refs */ }
      }
      for (const packedPath of [join(gitDir, 'packed-refs'), join(commonDir, 'packed-refs')]) {
        try {
          const packed = textValue(await fsImpl.readFile(packedPath, 'utf8'));
          for (const line of packed.split(/\r?\n/)) {
            const [value, packedRef] = line.trim().split(/\s+/, 2);
            if (packedRef === ref && /^[0-9a-f]{40}$/i.test(value)) return value;
          }
        } catch { /* candidate fixtures may omit packed refs */ }
      }
    }
  } catch { /* candidate exports do not need a .git directory */ }
  return null;
}

function usableAccounts(value) {
  const accounts = Array.isArray(value) ? value : value?.result;
  return (Array.isArray(accounts) ? accounts : []).filter((account) => typeof account?.id === 'string' && account.id.trim());
}

function subdomainFromResult(value) {
  const result = value?.result ?? value;
  const subdomain = result?.subdomain || result?.workersDevSubdomain || result?.workers_dev_subdomain || result?.name;
  if (typeof subdomain !== 'string' || !subdomain.trim()) fail('CLOUDFLARE_RESPONSE_INVALID', 'Cloudflare did not return a Workers.dev subdomain.');
  return subdomain.trim().replace(/^https?:\/\//i, '').replace(/\.workers\.dev\/?$/i, '').replace(/\/$/, '');
}

function buildWorkerOrigin(subdomain) {
  const hostname = `${WORKER_NAME}.${subdomain}.workers.dev`;
  try { return normalizeHttpsOrigin(`https://${hostname}`); } catch { fail('CLOUDFLARE_RESPONSE_INVALID', 'Cloudflare returned an invalid Workers.dev subdomain.'); }
}

function resourceId(resource) {
  return resource?.id || resource?.uuid || resource?.database_id || resource?.databaseId || null;
}

function parseWorkerDeploy(output) {
  const text = `${output?.stdout || ''}\n${output?.stderr || ''}`;
  const urls = [...text.matchAll(/https:\/\/[^\s'"<>]+/gi)].map((match) => match[0].replace(/[),.;]+$/, ''));
  const workerUrl = urls.find((url) => url.includes('.workers.dev'));
  const version = output?.workerVersion || output?.version || text.match(/(?:version\s+id|version)\s*[:=]\s*([A-Za-z0-9._-]+)/i)?.[1];
  return { workerOrigin: workerUrl ? normalizeHttpsOrigin(workerUrl) : null, workerVersion: version || null };
}

function safeRunnerError(result, code, action) {
  if (!result || result.code !== 0) fail(code, `Wrangler could not ${action}.`);
  return result;
}

async function writeState(fsImpl, statePath, state) {
  const text = `${JSON.stringify(state, null, 2)}\n`;
  if (/NOTION_CLIENT_SECRET|TOKEN_VAULT_KEY|CF_API_TOKEN|vault|secret|token/i.test(text)) fail('DEPLOYMENT_STATE_INVALID', 'Deployment state would contain a secret-like value.');
  await fsImpl.mkdir(dirname(statePath), { recursive: true });
  await fsImpl.writeFile(statePath, text, 'utf8');
}

async function readState(fsImpl, statePath) {
  if (!await exists(fsImpl, statePath)) return null;
  try {
    const state = JSON.parse(textValue(await fsImpl.readFile(statePath, 'utf8')));
    if (!state || typeof state !== 'object' || Array.isArray(state)) fail('DEPLOYMENT_STATE_INVALID', 'Deployment state is invalid.');
    return state;
  } catch (error) {
    if (error instanceof DeployError) throw error;
    fail('DEPLOYMENT_STATE_INVALID', 'Deployment state is invalid.');
  }
}

async function healthCheck({ fetchImpl, workerOrigin, extensionId }) {
  const origin = normalizeHttpsOrigin(workerOrigin);
  const extensionOrigin = `chrome-extension://${extensionId}`;
  const checks = [
    [new URL('/privacy', origin), { method: 'GET' }],
    [new URL('/v1/auth/start', origin), { method: 'POST', headers: { Origin: extensionOrigin, 'X-ProofClip-Install-Id': extensionId }, body: '{}' }],
    [new URL('/v1/connection', origin), { method: 'GET', headers: { Origin: extensionOrigin, 'X-ProofClip-Install-Id': extensionId } }]
  ];
  for (const [url, options] of checks) {
    let response;
    try { response = await fetchImpl(url.href, options); } catch { fail('HEALTH_CHECK_FAILED', 'The deployed Worker health check failed.'); }
    if (!response || response.status !== 200) fail('HEALTH_CHECK_FAILED', 'The deployed Worker health check failed.');
    if (url.pathname === '/privacy') continue;
    const allowOrigin = typeof response.headers?.get === 'function'
      ? response.headers.get('Access-Control-Allow-Origin')
      : null;
    if (allowOrigin !== extensionOrigin || typeof response.json !== 'function') {
      fail('HEALTH_CHECK_FAILED', 'The deployed Worker health response is invalid.');
    }
    let body;
    try { body = await response.json(); } catch { fail('HEALTH_CHECK_FAILED', 'The deployed Worker health response is invalid.'); }
    if (url.pathname === '/v1/auth/start') {
      if (!body || typeof body !== 'object' || typeof body.authorizationUrl !== 'string' || body.authorizationUrl.trim() === '') {
        fail('HEALTH_CHECK_FAILED', 'The deployed Worker OAuth health response is invalid.');
      }
    } else if (
      !body
      || typeof body !== 'object'
      || typeof body.connected !== 'boolean'
      || (body.updatedAt !== null && typeof body.updatedAt !== 'string')
    ) {
      fail('HEALTH_CHECK_FAILED', 'The deployed Worker connection health response is invalid.');
    }
  }
}

function stagingRootFor(repoRoot) {
  const root = resolve(repoRoot);
  return join(dirname(root), `.${basename(root)}-generated`);
}

function generateVaultKey() {
  try {
    const encoded = randomBytes(32).toString('base64');
    if (Buffer.from(encoded, 'base64').length !== 32) throw new Error('invalid vault key length');
    return encoded;
  } catch {
    throw new DeployError('VAULT_KEY_GENERATION_FAILED', 'A secure vault key could not be generated.');
  }
}

export async function runDeployment({ repoRoot, envPath, statePath, fetchImpl = fetch, spawnImpl, fsImpl = defaultFs, now = () => Date.now() }) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  if (!fsImpl || typeof fsImpl.readFile !== 'function') throw new TypeError('fsImpl must provide readFile');
  fsImpl = { ...defaultFs, ...fsImpl };
  const root = resolve(requiredText('repoRoot', repoRoot));
  const envFile = resolve(envPath || join(root, 'deploy', 'deploy.env'));
  const finalStatePath = resolve(statePath || join(root, 'deploy', '.state', 'deployment-state.json'));

  const candidate = await validateCandidate({ repoRoot: root, envPath: envFile, fsImpl });
  await validateCandidateIntegrity({ candidate, statePath: finalStatePath, fsImpl });
  const env = await loadEnvironment({ repoRoot: root, envPath: envFile, fsImpl });
  registerRedactionSecret(env.cfApiToken);

  const cloudflare = createCloudflareClient({ apiToken: env.cfApiToken, fetchImpl });
  await cloudflare.verifyToken();
  const accounts = usableAccounts(await cloudflare.listAccounts());
  if (accounts.length === 0) fail('CLOUDFLARE_ACCOUNT_UNAVAILABLE', 'No usable Cloudflare account is available.');
  if (accounts.length !== 1) fail('CLOUDFLARE_ACCOUNT_AMBIGUOUS', 'Exactly one usable Cloudflare account is required.');
  const accountId = accounts[0].id;
  const subdomain = subdomainFromResult(await cloudflare.getWorkersDevSubdomain(accountId));
  const workerOrigin = buildWorkerOrigin(subdomain);
  const callbackUrl = buildNotionRedirectUri(workerOrigin);
  const state = await readState(fsImpl, finalStatePath);

  const wranglerBinary = join(root, 'deploy', 'node_modules', '.bin', process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler');
  const provisionalRunner = createWranglerRunner({
    binaryPath: wranglerBinary,
    cwd: root,
    env: { CLOUDFLARE_API_TOKEN: env.cfApiToken },
    spawnImpl
  });
  let versionResult;
  try {
    versionResult = await provisionalRunner.run(['--version']);
  } catch {
    fail('DEPENDENCY_MISSING', 'The local Wrangler dependency is unavailable.');
  }
  safeRunnerError(versionResult, 'DEPENDENCY_MISSING', 'validate the local Wrangler installation');

  const ownership = await resolveDeploymentResources({
    cloudflare,
    state,
    accountId,
    candidate: {
      extensionId: candidate.extensionId,
      workerOrigin,
      candidateCommit: candidate.candidateCommit,
      candidateSha256: candidate.candidateSha256
    },
    names: { workerName: WORKER_NAME, d1Name: D1_NAME, marker: MARKER }
  });
  const d1Id = resourceId(ownership.d1);
  if (!d1Id) fail('RESOURCE_CONFLICT', 'The resolved D1 resource has no stable ID.');

  const generatedRoot = stagingRootFor(root);
  let staging;
  try {
    staging = await createStagingTree({
      candidateRoot: root,
      stagingRoot: generatedRoot,
      workerName: WORKER_NAME,
      d1Name: D1_NAME,
      d1Id,
      extensionId: candidate.extensionId,
      notionClientId: env.notionClientId,
      redirectUri: callbackUrl,
      candidateCommit: candidate.candidateCommit,
      candidateSha256: candidate.candidateSha256,
      fsImpl,
      writeState: false
    });
  } catch (error) {
    if (error instanceof DeployError) throw error;
    fail('CANDIDATE_PROVENANCE_FAILED', 'The deployment staging tree could not be created.');
  }

  const runner = createWranglerRunner({
    binaryPath: wranglerBinary,
    cwd: staging.workerDir,
    env: { CLOUDFLARE_API_TOKEN: env.cfApiToken },
    spawnImpl
  });

  safeRunnerError(await runner.run(['secret', 'put', 'NOTION_CLIENT_SECRET'], {
    input: `${env.notionClientSecret}\n`,
    redact: [env.notionClientSecret]
  }), 'WRANGLER_FAILED', 'store the Notion client secret');
  if (ownership.workerAction === 'create') {
    const vaultKey = generateVaultKey();
    safeRunnerError(await runner.run(['secret', 'put', 'TOKEN_VAULT_KEY'], {
      input: `${vaultKey}\n`,
      redact: [vaultKey]
    }), 'WRANGLER_FAILED', 'store the token vault key');
  }

  for (const file of ['src/schema.sql', 'migrations/20260813_privacy_nonretention.sql']) {
    safeRunnerError(await runner.run(['d1', 'execute', D1_NAME, '--file', file, '--remote']), 'D1_INITIALIZATION_FAILED', 'initialize the Community D1 database');
  }

  const deployResult = safeRunnerError(await runner.run(['deploy']), 'WORKER_DEPLOY_FAILED', 'deploy the Worker');
  let deployed;
  try { deployed = parseWorkerDeploy(deployResult); } catch { fail('HEALTH_CHECK_FAILED', 'Wrangler reported an invalid Worker origin.'); }
  if (!deployed.workerOrigin || deployed.workerOrigin !== workerOrigin || !deployed.workerVersion) {
    fail('HEALTH_CHECK_FAILED', 'The deployed Worker origin or version does not match preflight.');
  }

  await healthCheck({ fetchImpl, workerOrigin: deployed.workerOrigin, extensionId: candidate.extensionId });
  const remoteWorker = await cloudflare.getWorker(accountId, WORKER_NAME);
  const workerId = resourceId(remoteWorker) || resourceId(ownership.worker);
  if (!workerId) fail('HEALTH_CHECK_FAILED', 'The deployed Worker has no stable identity.');

  const finalState = {
    schemaVersion: 1,
    accountId,
    workerId,
    workerName: WORKER_NAME,
    d1Id,
    d1Name: D1_NAME,
    extensionId: candidate.extensionId,
    candidateCommit: candidate.candidateCommit,
    candidateSha256: candidate.candidateSha256
  };
  await writeState(fsImpl, finalStatePath, finalState);
  void now;

  return {
    ok: true,
    code: 'PASS',
    accountId,
    workerName: WORKER_NAME,
    d1Name: D1_NAME,
    workerOrigin: deployed.workerOrigin,
    callbackUrl,
    extensionDir: staging.extensionDir,
    statePath: finalStatePath,
    workerVersion: deployed.workerVersion
  };
}

const FAILURE_GUIDANCE = {
  DEPLOYMENT_ARGS_INVALID: ['Deployment arguments are invalid.', 'Invoke the deployer with exactly --env <path>.'],
  DEPLOY_ENV_MISSING: ['deploy.env is missing.', 'Create it from deploy.env.example and provide the three required values.'],
  NOTION_CREDENTIALS_MISSING: ['The Notion client credentials are missing.', 'Provide the client ID and client secret from the same Notion integration.'],
  CLOUDFLARE_AUTH_FAILED: ['Cloudflare authentication failed.', 'Check the API token and run the deployment again.'],
  CLOUDFLARE_PERMISSION_FAILED: ['Cloudflare permissions are insufficient.', 'Grant the required Workers and D1 permissions to the API token.'],
  CLOUDFLARE_ACCOUNT_AMBIGUOUS: ['More than one Cloudflare account is available.', 'Use a token that resolves to exactly one usable account.'],
  CANDIDATE_PROVENANCE_FAILED: ['The candidate is not a clean Community 0.8.1 package.', 'Use the verified 0.8.1 candidate package.'],
  RESOURCE_OWNERSHIP_UNVERIFIED: ['Existing resources could not be proven to belong to this deployment.', 'Stop and resolve ownership before retrying.'],
  RESOURCE_CONFLICT: ['Existing deployment identity conflicts with this candidate.', 'Stop and use the matching state, Worker, D1, and candidate together.'],
  HEALTH_CHECK_FAILED: ['The deployed Worker did not pass its identity or health checks.', 'Inspect the deployment account and retry only after the mismatch is resolved.'],
  WRANGLER_FAILED: ['Wrangler did not complete the deployment step.', 'Check the local Wrangler installation and Cloudflare permissions.'],
  D1_INITIALIZATION_FAILED: ['The Community D1 initialization did not complete.', 'Verify D1 permissions and retry the same deployment.'],
  VAULT_KEY_GENERATION_FAILED: ['A secure vault key could not be generated.', 'Retry on a supported Node.js runtime.'],
  DEPENDENCY_MISSING: ['The local Wrangler dependency is unavailable.', 'Install the pinned deploy dependencies and retry.']
};

export function formatFinalSummary(result) {
  if (result?.ok === true && result?.code === 'PASS') {
    return [
      `Worker URL: ${redactText(String(result.workerOrigin || ''))}`,
      `Notion callback URL: ${redactText(String(result.callbackUrl || ''))}`,
      `Generated extension directory: ${redactText(String(result.extensionDir || ''))}`,
      `Worker name: ${redactText(String(result.workerName || ''))}`,
      `D1 name: ${redactText(String(result.d1Name || ''))}`,
      `Worker version: ${redactText(String(result.workerVersion || ''))}`,
      'PASS'
    ].join('\n');
  }
  const code = typeof result?.code === 'string' && /^[A-Z0-9_]+$/.test(result.code) ? result.code : 'DEPLOYMENT_FAILED';
  const [explanation, nextAction] = FAILURE_GUIDANCE[code] || ['Deployment failed.', 'Review the stable failure code and correct the local deployment inputs.'];
  return [`FAILURE: ${code}`, `Explanation: ${explanation}`, `Next action: ${nextAction}`].join('\n');
}

async function runDirectCli(args) {
  try {
    const repoRoot = resolve(dirname(MODULE_PATH), '..');
    const envPath = resolve(repoRoot, parseCliArgs(args));
    const statePath = join(repoRoot, 'deploy', '.state', 'deployment-state.json');
    const result = await runDeployment({ repoRoot, envPath, statePath });
    process.stdout.write(`${formatFinalSummary(result)}\n`);
    return 0;
  } catch (error) {
    const code = typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code)
      ? error.code
      : 'DEPLOYMENT_FAILED';
    process.stdout.write(`${formatFinalSummary({ ok: false, code })}\n`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === MODULE_PATH) {
  process.exitCode = await runDirectCli(process.argv.slice(2));
}
