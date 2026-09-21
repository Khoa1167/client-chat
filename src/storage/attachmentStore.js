import { Capacitor } from '@capacitor/core';

let enginePromise;

const getEngine = () => {
  enginePromise ??= Capacitor.isNativePlatform()
    ? import('./nativeAttachmentStore.js')
    : import('./webAttachmentStore.js');
  return enginePromise;
};

export const getAttachmentCiphertext = async (userId, roomId, attachmentId) =>
  (await getEngine()).getAttachmentCiphertext(userId, roomId, attachmentId);
export const saveAttachmentCiphertext = async (userId, roomId, attachmentId, ciphertext) =>
  (await getEngine()).saveAttachmentCiphertext(userId, roomId, attachmentId, ciphertext);
export const clearUserAttachments = async userId =>
  (await getEngine()).clearUserAttachments(userId);
