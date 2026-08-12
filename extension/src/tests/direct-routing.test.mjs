import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCaptureRoute, outboxFailurePolicy } from '../core/direct-routing.mjs';
import { ProofClipApiError } from '../core/proofclip-api.mjs';

test('normalizeCaptureRoute defaults missing or invalid values to archive', () => {
  assert.equal(normalizeCaptureRoute(), 'archive');
  assert.equal(normalizeCaptureRoute(null), 'archive');
  assert.equal(normalizeCaptureRoute(''), 'archive');
  assert.equal(normalizeCaptureRoute('unknown'), 'archive');
  assert.equal(normalizeCaptureRoute(123), 'archive');
  assert.equal(normalizeCaptureRoute({}), 'archive');
});

test('normalizeCaptureRoute passes valid archive and direct through unchanged', () => {
  assert.equal(normalizeCaptureRoute('archive'), 'archive');
  assert.equal(normalizeCaptureRoute('direct'), 'direct');
});

test('outboxFailurePolicy classifies a 400-api response as NEEDS_VERIFICATION', () => {
  const error = new ProofClipApiError('Bad request', { kind: 'response', status: 400 });
  const policy = outboxFailurePolicy(error);
  assert.deepEqual(policy, { state: 'NEEDS_VERIFICATION', canOrdinaryRetry: false });
});

test('outboxFailurePolicy classifies a 429-api response as RETRYABLE with ordinary retry allowed', () => {
  const error = new ProofClipApiError('Rate limited', { kind: 'response', status: 429 });
  const policy = outboxFailurePolicy(error);
  assert.deepEqual(policy, { state: 'RETRYABLE', canOrdinaryRetry: true });
});

test('outboxFailurePolicy classifies a 408-api response as RETRYABLE with ordinary retry allowed', () => {
  const error = new ProofClipApiError('Timed out', { kind: 'response', status: 408 });
  const policy = outboxFailurePolicy(error);
  assert.deepEqual(policy, { state: 'RETRYABLE', canOrdinaryRetry: true });
});

test('outboxFailurePolicy classifies other 4xx responses as NEEDS_VERIFICATION', () => {
  for (const status of [401, 403, 404, 409, 422]) {
    const error = new ProofClipApiError(`Error ${status}`, { kind: 'response', status });
    assert.deepEqual(outboxFailurePolicy(error), { state: 'NEEDS_VERIFICATION', canOrdinaryRetry: false });
  }
});

test('outboxFailurePolicy classifies a 500-api response as NEEDS_VERIFICATION without ordinary retry', () => {
  const error = new ProofClipApiError('Server error', { kind: 'response', status: 500 });
  const policy = outboxFailurePolicy(error);
  assert.deepEqual(policy, { state: 'NEEDS_VERIFICATION', canOrdinaryRetry: false });
});

test('outboxFailurePolicy classifies any 5xx response as NEEDS_VERIFICATION', () => {
  for (const status of [502, 503, 504]) {
    const error = new ProofClipApiError(`Error ${status}`, { kind: 'response', status });
    assert.deepEqual(outboxFailurePolicy(error), { state: 'NEEDS_VERIFICATION', canOrdinaryRetry: false });
  }
});

test('outboxFailurePolicy classifies a network-kind error as NEEDS_VERIFICATION', () => {
  const error = new ProofClipApiError('Connection refused', { kind: 'network' });
  const policy = outboxFailurePolicy(error);
  assert.deepEqual(policy, { state: 'NEEDS_VERIFICATION', canOrdinaryRetry: false });
});

test('outboxFailurePolicy classifies a plain Error as NEEDS_VERIFICATION', () => {
  const error = new Error('Something went wrong');
  const policy = outboxFailurePolicy(error);
  assert.deepEqual(policy, { state: 'NEEDS_VERIFICATION', canOrdinaryRetry: false });
});

test('outboxFailurePolicy classifies a non-Error value as NEEDS_VERIFICATION', () => {
  assert.deepEqual(outboxFailurePolicy('some string'), { state: 'NEEDS_VERIFICATION', canOrdinaryRetry: false });
  assert.deepEqual(outboxFailurePolicy(null), { state: 'NEEDS_VERIFICATION', canOrdinaryRetry: false });
});
