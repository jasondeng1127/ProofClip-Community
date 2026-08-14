import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('popup does not render a connected users Notion workspace name', async () => {
  const source = await readFile(new URL('../popup.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /state\.connection\.workspaceName/);
  assert.match(source, /'Connected to Notion\.'/);
});
