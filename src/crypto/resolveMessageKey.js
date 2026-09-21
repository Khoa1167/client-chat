import { getSenderKeyDoc } from '../api/rooms.api';
import { getDeviceId, getPrivateKey, getHistoryKey, listHistoryKeyIds } from './deviceKeys';
import { getSenderKey, unwrapSenderKey, storeSenderKey } from './senderKey';

export async function resolveMessageKey(roomId, msg) {
  const devId = getDeviceId();

  let senderKey = await getSenderKey(roomId, msg.senderDeviceId, msg.epoch);
  if (senderKey) return senderKey;

  const dist = await getSenderKeyDoc(roomId, { epoch: msg.epoch, senderDeviceId: msg.senderDeviceId });
  for (const keyId of [devId, ...listHistoryKeyIds()]) {
    const wrapped = dist.encryptedKeys?.[keyId];
    if (!wrapped) continue;
    const privateKey = keyId === devId ? await getPrivateKey(keyId) : await getHistoryKey(keyId);
    if (!privateKey) continue;
    senderKey = await unwrapSenderKey(wrapped, privateKey);
    await storeSenderKey(roomId, msg.senderDeviceId, msg.epoch, senderKey);
    return senderKey;
  }
  return null;
}
