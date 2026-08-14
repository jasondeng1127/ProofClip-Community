import test from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../rate-limit.mjs';

const START = 1_800_000_000_000;

test('rate limiter counts within a fixed window and resets after the window', () => {
  let time = START;
  const limiter = createRateLimiter({ windowMs: 60_000, limit: 3, now: () => time });
  assert.deepEqual(limiter.hit('device-a'), { allowed: true, remaining: 2 });
  time += 10_000;
  assert.deepEqual(limiter.hit('device-a'), { allowed: true, remaining: 1 });
  time += 40_000;
  assert.deepEqual(limiter.hit('device-a'), { allowed: true, remaining: 0 });
  time += 1;
  assert.equal(limiter.hit('device-a').allowed, false);
  time = START + 60_000;
  assert.deepEqual(limiter.hit('device-a'), { allowed: true, remaining: 2 });
});

test('rate limiter enforces the boundary and reports retry-after', () => {
  let time = START;
  const limiter = createRateLimiter({ windowMs: 60_000, limit: 2, now: () => time });
  limiter.hit('device-a');
  limiter.hit('device-a');
  const blocked = limiter.hit('device-a');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterMs > 0 && blocked.retryAfterMs <= 60_000);
  time += 59_999;
  assert.equal(limiter.hit('device-a').allowed, false);
  time += 1;
  assert.equal(limiter.hit('device-a').allowed, true);
});

test('rate limiter keys are isolated per device and reset clears a key', () => {
  let time = START;
  const limiter = createRateLimiter({ windowMs: 60_000, limit: 1, now: () => time });
  assert.equal(limiter.hit('device-a').allowed, true);
  assert.equal(limiter.hit('device-a').allowed, false);
  assert.equal(limiter.hit('device-b').allowed, true);
  limiter.reset('device-a');
  assert.equal(limiter.hit('device-a').allowed, true);
  assert.equal(limiter.size(), 2);
});

test('rate limiter prunes expired keys and caps retained entries', () => {
  let time = START;
  const limiter = createRateLimiter({ windowMs: 60_000, limit: 2, maxEntries: 2, now: () => time });
  limiter.hit('first');
  limiter.hit('second');
  limiter.hit('third');
  assert.equal(limiter.size(), 2);

  time += 60_000;
  limiter.hit('fresh');
  assert.equal(limiter.size(), 1);
});
