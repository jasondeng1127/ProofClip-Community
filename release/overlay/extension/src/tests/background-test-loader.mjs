import { randomUUID } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const backgroundPath = new URL('../background.js', import.meta.url);

export async function loadBackgroundForTests() {
  const source = await readFile(backgroundPath, 'utf8');
  const transformed = source.replace(
    "import { proofclipApi, ProofClipApiError } from './core/proofclip-api.mjs';",
    "import { proofclipApi, ProofClipApiError } from './tests/test-proofclip-api.mjs';"
  );
  const temporaryPath = fileURLToPath(new URL(`../background.test-${randomUUID()}.mjs`, import.meta.url));
  await writeFile(temporaryPath, transformed, 'utf8');
  try {
    return await import(`${new URL(`../background.test-${temporaryPath.split('background.test-')[1]}`, import.meta.url).href}`);
  } finally {
    await unlink(temporaryPath).catch(() => {});
  }
}
