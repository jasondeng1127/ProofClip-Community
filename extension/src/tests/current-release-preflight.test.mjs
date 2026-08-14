import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import test from 'node:test';

// Community release preflight: the current release record must exist, bind a
// package artifact, and keep public release blocked. The record is created at
// release cut time (release/cut-release.mjs), so this test is skipped in the
// generated staging tree and runs in the main tree after a cut.
test('the current release record binds the frozen source and keeps public release blocked', () => {
  const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
  const recordPath = resolve(root, 'release/records/release-record.json');
  const auditPath = resolve(root, 'release/release-audit.mjs');

  if (!existsSync(recordPath)) {
    test.skip('current release record is created at cut time; not present in this tree');
    return;
  }
  assert.ok(existsSync(auditPath), 'release-audit must exist next to the record');
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert.equal(record.version, '0.8.0');
  assert.notEqual(record.state, 'RELEASED', 'public release must remain blocked');
  assert.ok(record.artifact?.sha256, 'artifact sha256 must be recorded');
  assert.ok(record.sourceBinding?.workspaceFingerprint, 'source fingerprint must be recorded');
});