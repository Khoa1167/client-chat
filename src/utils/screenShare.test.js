import assert from 'node:assert/strict';
import test from 'node:test';
import { replaceOutgoingVideoTrack } from './screenShare.js';

test('screen sharing replaces only the outgoing video track', async () => {
  const replacement = { kind: 'video', id: 'screen' };
  let receivedTrack;
  const peerConnection = {
    getSenders: () => [
      { track: { kind: 'audio' }, replaceTrack: () => assert.fail('replaced audio') },
      { track: { kind: 'video' }, replaceTrack: async (track) => { receivedTrack = track; } },
    ],
  };

  await replaceOutgoingVideoTrack(peerConnection, replacement);
  assert.equal(receivedTrack, replacement);
  assert.throws(() => replaceOutgoingVideoTrack(peerConnection, { kind: 'audio' }), /video track/);
});
