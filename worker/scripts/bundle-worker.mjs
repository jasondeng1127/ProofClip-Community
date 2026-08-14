import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const modules = [
  'src/identity.mjs',
  'src/oauth.mjs',
  'src/token-vault.mjs',
  'src/d1-repository.mjs',
  'src/notion-proxy.mjs',
  'src/rate-limit.mjs',
  'src/worker.mjs',
  'src/index.mjs'
];

const source = (await Promise.all(modules.map(async (file) => {
  const content = await readFile(resolve(root, file), 'utf8');
  return `// ${file}\n${content
    .replace(/^import[^\n]+\n/gm, '')
    .replace(/^export (?=(async )?function)/gm, '')}`;
}))).join('\n\n');

await mkdir(resolve(root, 'dist'), { recursive: true });
await writeFile(resolve(root, 'dist/worker.mjs'), `${source}\n`, 'utf8');
