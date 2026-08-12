import assert from 'node:assert/strict';
import test from 'node:test';
import { withProjectNameForDelivery } from '../core/project-delivery.mjs';

test('resolves a local project id to its current user-facing name only for delivery', () => {
  const record = { id: 'card-1', projectId: 'buyers', title: 'Evidence' };
  const result = withProjectNameForDelivery(record, [
    { id: 'unfiled', name: 'Unfiled' },
    { id: 'buyers', name: 'Active buyers' }
  ]);
  assert.equal(record.projectName, undefined);
  assert.equal(result.projectId, 'buyers');
  assert.equal(result.projectName, 'Active buyers');
});

test('falls back to the stable Unfiled project name for migrated records', () => {
  assert.equal(withProjectNameForDelivery({ projectId: 'unfiled' }, [{ id: 'unfiled', name: 'Unfiled' }]).projectName, 'Unfiled');
});
