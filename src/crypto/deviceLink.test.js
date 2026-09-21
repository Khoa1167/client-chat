import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.localStorage = { getItem: () => null, removeItem: () => {}, setItem: () => {} };
const { decodeArchiveFrame, encodeArchiveFrame, readArchiveFrameHeader } = await import('./deviceLink.js');

test('device-link frame authenticates its session and round-trips', async () => {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const frame = await encodeArchiveFrame(key, 'session-a', 0, { type: 'manifest', senderKeys: [] }, true);
  const decoded = await decodeArchiveFrame(key, 'session-a', frame, 0);
  assert.equal(decoded.payload.type, 'manifest');
  assert.equal(decoded.flags & 1, 1);
  await assert.rejects(() => decodeArchiveFrame(key, 'session-b', frame, 0));
});

test('device-link frame parser rejects oversized ciphertext declarations', () => {
  const header = new Uint8Array(9);
  new DataView(header.buffer).setUint32(5, 4 * 1024 * 1024 + 1, false);
  assert.throws(() => readArchiveFrameHeader(header));
});
