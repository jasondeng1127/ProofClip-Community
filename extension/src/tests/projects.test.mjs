import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, deleteProject, renameProject, updateCardMetadata } from '../core/projects.mjs';

const state = {
  projects: [{ id: 'unfiled', name: 'Unfiled', createdAt: null }, { id: 'buyers', name: 'Buyers', createdAt: '2026-07-30T00:00:00.000Z' }],
  archive: [{ id: 'card-1', title: 'Acme', canonicalUrl: 'https://example.test', capturedAt: '2026-07-30T00:00:00.000Z', bodyText: '', bodySha256: '', truncated: false, projectId: 'buyers', tags: [], note: '', screenshot: null, delivery: { status: 'PENDING' } }],
  outbox: []
};

test('creates a normalized project with a unique id', () => {
  const next = createProject(state, { id: 'regulation', name: '  Regulation watch  ', createdAt: '2026-07-30T01:00:00.000Z' });
  assert.equal(next.projects.at(-1).name, 'Regulation watch');
  assert.throws(() => createProject(next, { id: 'regulation', name: 'Duplicate', createdAt: null }), /already exists/);
});

test('rejects a new project whose normalized name already exists', () => {
  assert.throws(
    () => createProject(state, { id: 'buyers-copy', name: '  buyers  ', createdAt: null }),
    /Project name already exists/
  );
});

test('requires an explicit move to Unfiled before deleting a populated project', () => {
  assert.throws(() => deleteProject(state, 'buyers', {}), /moveToUnfiled/);
  const next = deleteProject(state, 'buyers', { moveToUnfiled: true });
  assert.equal(next.archive[0].projectId, 'unfiled');
  assert.equal(next.projects.some(({ id }) => id === 'buyers'), false);
});

test('renames a non-default project without changing its cards', () => {
  const next = renameProject(state, 'buyers', '  Active buyers  ');
  assert.equal(next.projects.find(({ id }) => id === 'buyers').name, 'Active buyers');
  assert.equal(next.archive[0].projectId, 'buyers');
  assert.throws(() => renameProject(state, 'unfiled', 'Anything'), /cannot be renamed/);
});

test('rejects a project rename that collides with another normalized name', () => {
  const withTwoProjects = createProject(state, { id: 'rules', name: 'Rules', createdAt: null });
  assert.throws(() => renameProject(withTwoProjects, 'rules', ' BUYERS '), /Project name already exists/);
});

test('updates only user-managed card metadata and requires an existing project', () => {
  const next = updateCardMetadata(state, 'card-1', { projectId: 'unfiled', tags: [' Buyer ', 'buyer'], note: '  Worth contacting  ' });
  assert.equal(next.archive[0].projectId, 'unfiled');
  assert.deepEqual(next.archive[0].tags, ['buyer']);
  assert.equal(next.archive[0].note, 'Worth contacting');
  assert.throws(() => updateCardMetadata(state, 'card-1', { projectId: 'missing' }), /does not exist/);
});

test('single-card tag edits are normalized to one lowercase deduplicated source (TAGS-001)', () => {
  const next = updateCardMetadata(state, 'card-1', { projectId: 'unfiled', tags: ['  MixedCase ', 'TAG', 'tag', '', 'Other  '] });
  assert.deepEqual(next.archive[0].tags, ['mixedcase', 'tag', 'other']);
  assert.deepEqual(next.outbox, []);
});
