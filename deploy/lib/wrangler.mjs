import { spawn } from 'node:child_process';

import { DeployError, redactText, registerRedactionSecret } from './errors.mjs';

const SECRET_ENV_NAMES = new Set([
  'CF_API_TOKEN',
  'CLOUDFLARE_API_TOKEN',
  'NOTION_CLIENT_SECRET',
  'TOKEN_VAULT_KEY',
  'NOTION_CLIENT_ID'
]);
const SECRET_ENV_PATTERN = /(token|secret|vault|key|auth|password)/i;

function registerSecretEnvironmentValues(environment) {
  for (const [name, value] of Object.entries(environment)) {
    if (SECRET_ENV_NAMES.has(name) || SECRET_ENV_PATTERN.test(name)) registerRedactionSecret(value);
  }
}

function collect(stream) {
  return new Promise((resolve) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

export function createWranglerRunner({ binaryPath, cwd, env, spawnImpl = spawn }) {
  if (typeof binaryPath !== 'string' || binaryPath.trim() === '') throw new TypeError('binaryPath must be a non-empty string');
  if (typeof spawnImpl !== 'function') throw new TypeError('spawnImpl must be a function');

  async function run(args, { input, redact = [] } = {}) {
    if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) {
      throw new TypeError('Wrangler args must be an array of strings');
    }
    for (const secret of redact) registerRedactionSecret(secret);
    const childEnv = { ...process.env, ...(env || {}) };
    registerSecretEnvironmentValues(childEnv);
    if (input !== undefined && input !== null) {
      registerRedactionSecret(Buffer.isBuffer(input) ? input.toString('utf8') : String(input));
    }

    return new Promise((resolve, reject) => {
      let child;
      try {
        child = spawnImpl(binaryPath, args, {
          cwd,
          env: childEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true
        });
      } catch (error) {
        reject(new DeployError('WRANGLER_FAILED', redactText(`Wrangler could not start: ${error?.message || 'spawn failed'}`)));
        return;
      }

      const stdoutPromise = collect(child.stdout);
      const stderrPromise = collect(child.stderr);
      let settled = false;
      child.once('error', (error) => {
        if (settled) return;
        settled = true;
        reject(new DeployError('WRANGLER_FAILED', redactText(`Wrangler execution failed: ${error?.message || 'child process error'}`)));
      });
      child.once('close', async (code) => {
        if (settled) return;
        const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
        settled = true;
        resolve({ code, stdout: redactText(stdout), stderr: redactText(stderr) });
      });
      if (child.stdin) child.stdin.end(input === undefined ? undefined : input);
    });
  }

  return { run };
}
