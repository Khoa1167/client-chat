/**
 * Mã hóa nhóm (Sender Key) — 1 khóa AES tĩnh/thiết bị gửi/epoch, KHÔNG RSA-wrap mỗi tin nhắn
 * như sessionKey.js, chỉ AES-GCM bằng Sender Key đã có sẵn (phân phối 1 lần khi tạo/khi đổi
 * epoch qua wrapKeyForDevices tái dùng từ sessionKey.js).
 * Xem CLAUDE.md/plan "Sender Key cho mã hóa nhóm" — đánh đổi có chủ đích: khóa tĩnh theo epoch,
 * không tự ratchet từng tin nhắn như Signal thật.
 */

import { storePrivateKey, getPrivateKey, getHistoryKey } from './deviceKeys';
import { wrapKeyForDevices, encryptTextWithKey, decryptContentWithKey } from './sessionKey';
import { base64ToArrayBuffer } from './base64';

export const generateSenderKey = async () => {
  return await window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
};

export const wrapSenderKeyForDevices = async (senderKey, devicePublicKeys) => {
  const rawKey = await window.crypto.subtle.exportKey('raw', senderKey);
  return wrapKeyForDevices(rawKey, devicePublicKeys);
};

export const unwrapSenderKey = async (wrappedBase64, privateKey) => {
  const wrappedBuf = base64ToArrayBuffer(wrappedBase64);
  const rawKey = await window.crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, wrappedBuf);
  return window.crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
};

export const encryptWithSenderKey = (text, senderKey) => encryptTextWithKey(text, senderKey);

export const decryptWithSenderKey = async (msg, senderKey) => {
  try {
    return await decryptContentWithKey(msg, senderKey);
  } catch (err) {
    console.error('[E2EE] Sender Key decryption error:', err);
    return '[Lỗi Giải Mã Tin Nhắn]';
  }
};

// Cache Sender Key cục bộ — dùng chung IndexedDB store 'privateKeys' của deviceKeys.js, key
// prefix riêng để không đụng namespace với private key thiết bị.
const senderKeyStorageKey = (roomId, deviceId, epoch) => `senderkey_${roomId}_${deviceId}_${epoch}`;

export const storeSenderKey = (roomId, deviceId, epoch, senderKey) =>
  storePrivateKey(senderKeyStorageKey(roomId, deviceId, epoch), senderKey);

export const getSenderKey = (roomId, deviceId, epoch) =>
  getPrivateKey(senderKeyStorageKey(roomId, deviceId, epoch))
    .then(key => key || getHistoryKey(senderKeyStorageKey(roomId, deviceId, epoch)));
