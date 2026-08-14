import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLunaLabel } from './luna-label.mjs';

test('normalizes a Luna label', () => {
  assert.equal(normalizeLunaLabel('  Luna   Worker  '), 'luna-worker');
});

test('rejects non-string values', () => {
  assert.throws(() => normalizeLunaLabel(42), TypeError);
});
