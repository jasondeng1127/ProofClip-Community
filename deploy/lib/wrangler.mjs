import { spawn } from 'node:child_process';

import { DeployError, redactText, registerRedactionSecret } from './errors.mjs';

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

    let child;
    try {
      child = spawnImpl(binaryPath, args, {
        cwd,
        env: { ...process.env, ...(env || {}) },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });
    } catch (error) {
      throw new DeployError('WRANGLER_FAILED', redactText(`Wrangler could not start: ${error?.message || 'spawn failed'}`));
    }

    const stdoutPromise = collect(child.stdout);
    const stderrPromise = collect(child.stderr);

    if (child.stdin) child.stdin.end(input === undefined ? undefined : input);

    return new Promise((resolve, reject) => {
      child.once('error', (error) => {
        reject(new DeployError('WRANGLER_FAILED', redactText(`Wrangler execution failed: ${error?.message || 'child process error'}`)));
      });
      child.once('close', async (code) => {
        const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
        resolve({ code, stdout: redactText(stdout), stderr: redactText(stderr) });
      });
    });
  }

  return { run };
}
