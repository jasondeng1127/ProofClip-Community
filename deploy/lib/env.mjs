import { readFile } from 'node:fs/promises';
import { DeployError, registerRedactionSecret } from './errors.mjs';

export const REQUIRED_ENV_KEYS = [
  'CF_API_TOKEN',
  'NOTION_CLIENT_ID',
  'NOTION_CLIENT_SECRET',
];

function parseDeployEnv(content) {
  const values = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1);
    if (value.startsWith('"') && !value.endsWith('"')) {
      throw new DeployError('DEPLOY_ENV_INVALID', 'Quoted deploy env values cannot span multiple lines.');
    }
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
      if (value.includes('\n') || value.includes('\r')) {
        throw new DeployError('DEPLOY_ENV_INVALID', 'Deploy env values cannot contain newlines.');
      }
    }
    values[key] = value;
  }
  return values;
}

export function assertDeployEnvShape(values) {
  const missing = REQUIRED_ENV_KEYS.filter((key) => !(key in values) || values[key] === '');
  if (missing.length > 0) {
    throw new DeployError('DEPLOY_ENV_MISSING', 'Missing required deploy environment values.', { missing });
  }
  const result = {
    cfApiToken: values.CF_API_TOKEN,
    notionClientId: values.NOTION_CLIENT_ID,
    notionClientSecret: values.NOTION_CLIENT_SECRET,
  };
  for (const value of Object.values(result)) {
    registerRedactionSecret(value);
  }
  return result;
}

export async function loadDeployEnv({ filePath, repoRoot, gitFiles }) {
  const trackedFiles = await gitFiles();
  if (trackedFiles.includes('deploy/deploy.env')) {
    throw new DeployError('DEPLOY_ENV_TRACKED', 'deploy/deploy.env is tracked and cannot be used for secrets.');
  }
  let content;
  try {
    content = await readFile(filePath, 'utf8');
  } catch {
    throw new DeployError('DEPLOY_ENV_MISSING', 'deploy/deploy.env is missing.');
  }
  const values = parseDeployEnv(content);
  const shaped = assertDeployEnvShape(values);
  return shaped;
}
