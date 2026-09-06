import { execFile } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { buildNotionRedirectUri, patchCommunityOrigin } from './origin.mjs';

const execFileAsync = promisify(execFile);
const DEPLOYMENT_MARKER = 'community-0.8.1';
const CALLBACK_PATH = '/v1/auth/notion/callback';
const TEMPLATE_PATH = fileURLToPath(new URL('../wrangler.template.jsonc', import.meta.url));

function requiredText(name, value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function containedPath(root, ...parts) {
  const rootPath = resolve(root);
  const targetPath = resolve(rootPath, ...parts);
  const prefix = rootPath.endsWith(sep) ? rootPath : `${rootPath}${sep}`;
  if (targetPath !== rootPath && !targetPath.startsWith(prefix)) {
    throw new TypeError(`Path escapes root: ${relative(rootPath, targetPath)}`);
  }
  return targetPath;
}

function readTemplate(templatePath) {
  return JSON.parse(readFileSync(templatePath, 'utf8'));
}

function renderFromTemplate(template, values) {
  const config = structuredClone(template);
  config.name = requiredText('workerName', values.workerName);
  config.compatibility_date = '2026-08-14';
  config.preview_urls = false;
  config.observability = { enabled: true, logs: { enabled: true } };
  config.d1_databases = [{
    binding: 'DB',
    database_name: requiredText('d1Name', values.d1Name),
    database_id: requiredText('d1Id', values.d1Id)
  }];
  config.vars = {
    PROOFCLIP_EXTENSION_ID: requiredText('extensionId', values.extensionId),
    NOTION_CLIENT_ID: requiredText('notionClientId', values.notionClientId),
    NOTION_REDIRECT_URI: requiredText('redirectUri', values.redirectUri),
    PROOFCLIP_DEPLOYMENT_MARKER: requiredText('marker', values.marker)
  };
  return `${JSON.stringify(config, null, 2)}\n`;
}

export function renderWranglerConfig({
  workerName,
  d1Name,
  d1Id,
  extensionId,
  notionClientId,
  redirectUri,
  marker = DEPLOYMENT_MARKER
}) {
  return renderFromTemplate(readTemplate(TEMPLATE_PATH), {
    workerName,
    d1Name,
    d1Id,
    extensionId,
    notionClientId,
    redirectUri,
    marker
  });
}

function originFromRedirectUri(redirectUri) {
  requiredText('redirectUri', redirectUri);
  if (!redirectUri.endsWith(CALLBACK_PATH)) {
    throw new TypeError(`redirectUri must end with ${CALLBACK_PATH}`);
  }
  const origin = redirectUri.slice(0, -CALLBACK_PATH.length);
  if (buildNotionRedirectUri(origin) !== redirectUri) {
    throw new TypeError('redirectUri must be the canonical HTTPS Notion callback URI');
  }
  return origin;
}

async function copyDirectory(candidateRoot, stagingRoot, sourceRelative, destinationRelative) {
  const source = containedPath(candidateRoot, ...sourceRelative.split('/'));
  const destination = containedPath(stagingRoot, ...destinationRelative.split('/'));
  await cp(source, destination, { recursive: true, force: true });
}

export async function createStagingTree({
  candidateRoot,
  stagingRoot,
  workerName,
  d1Name,
  d1Id,
  extensionId,
  notionClientId,
  redirectUri
}) {
  const candidatePath = resolve(requiredText('candidateRoot', candidateRoot));
  const generatedPath = resolve(requiredText('stagingRoot', stagingRoot));
  if (candidatePath === generatedPath || candidatePath.startsWith(`${generatedPath}${sep}`)) {
    throw new TypeError('stagingRoot must not contain candidateRoot');
  }

  const extensionDir = containedPath(generatedPath, 'extension');
  const workerDir = containedPath(generatedPath, 'worker');
  const configPath = containedPath(workerDir, 'wrangler.jsonc');
  const statePath = containedPath(generatedPath, 'deployment-state.json');
  const origin = originFromRedirectUri(redirectUri);

  await rm(generatedPath, { recursive: true, force: true });
  await mkdir(generatedPath, { recursive: true });
  await copyDirectory(candidatePath, generatedPath, 'extension/src', 'extension');
  await copyDirectory(candidatePath, generatedPath, 'worker/src', 'worker/src');
  await copyDirectory(candidatePath, generatedPath, 'worker/migrations', 'worker/migrations');
  await copyDirectory(candidatePath, generatedPath, 'worker/scripts', 'worker/scripts');

  const templatePath = containedPath(candidatePath, 'deploy', 'wrangler.template.jsonc');
  const template = JSON.parse(await readFile(templatePath, 'utf8'));
  const renderedConfig = renderFromTemplate(template, {
    workerName,
    d1Name,
    d1Id,
    extensionId,
    notionClientId,
    redirectUri,
    marker: DEPLOYMENT_MARKER
  });
  await writeFile(configPath, renderedConfig, 'utf8');

  const communityConfigPath = containedPath(extensionDir, 'community-config.mjs');
  const communityConfig = await readFile(communityConfigPath, 'utf8');
  await writeFile(communityConfigPath, patchCommunityOrigin(communityConfig, origin), 'utf8');

  const bundleScript = containedPath(workerDir, 'scripts', 'bundle-worker.mjs');
  await execFileAsync(process.execPath, [bundleScript], { cwd: workerDir, windowsHide: true });

  const state = {
    version: '0.8.1',
    marker: DEPLOYMENT_MARKER,
    workerName: requiredText('workerName', workerName),
    d1Name: requiredText('d1Name', d1Name),
    d1Id: requiredText('d1Id', d1Id),
    extensionId: requiredText('extensionId', extensionId),
    redirectUri,
    extensionDir,
    workerDir,
    configPath
  };
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

  return { extensionDir, workerDir, configPath, statePath };
}
