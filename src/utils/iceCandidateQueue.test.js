import test from 'node:test';
import assert from 'node:assert/strict';
import { flushIceCandidateQueue } from './iceCandidateQueue.js';

test('flushes ICE candidates in arrival order', async () => {
  const queue = [{ id: 'first' }, { id: 'second' }, { id: 'third' }];
  const seen = [];

  await flushIceCandidateQueue({
    queue,
    onCandidate: async (candidate) => {
      seen.push(candidate.id);
    },
  });

  assert.deepEqual(seen, ['first', 'second', 'third']);
  assert.deepEqual(queue, []);
});

test('keeps draining after a candidate error without losing the remaining queue', async () => {
  const queue = [{ id: 'one' }, { id: 'two' }, { id: 'three' }];
  const seen = [];

  await flushIceCandidateQueue({
    queue,
    onCandidate: async (candidate) => {
      seen.push(candidate.id);
      if (candidate.id === 'two') {
        throw new Error('candidate failed');
      }
    },
  });

  assert.deepEqual(seen, ['one', 'two', 'three']);
  assert.deepEqual(queue, []);
});
