/**
 * Mã hóa 1-1 (DM): AES-GCM session key mã hóa nội dung, RSA-OAEP wrap session key riêng cho
 * từng thiết bị của người nhận.
 */

import { importPublicKey, getPrivateKey, getHistoryKey, listHistoryKeyIds } from './deviceKeys';
import { arrayBufferToBase64, base64ToArrayBuffer } from './base64';

/**
 * Sinh AES Session Key 256-bit + RSA-wrap cho từng thiết bị — tách riêng khỏi bước mã hóa nội
 * dung để 1 session key có thể dùng mã hóa NHIỀU thứ cho cùng 1 tin nhắn (vd text + file đính
 * kèm của tin nhắn ảnh) mà chỉ phải RSA-wrap 1 lần.
 * @param {Array<{ deviceId: string, publicKey: string }>} devicePublicKeys
 * @returns {Promise<{ sessionKey: CryptoKey, encryptedKeys: object }>}
 */
export const createSessionKeyEnvelope = async (devicePublicKeys) => {
  const sessionKey = await window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const rawSessionKey = await window.crypto.subtle.exportKey('raw', sessionKey);
  const encryptedKeys = await wrapKeyForDevices(rawSessionKey, devicePublicKeys);
  return { sessionKey, encryptedKeys };
};

/**
 * Mã hóa text bằng 1 AES key đã có sẵn (session key hoặc Sender Key) — phần lõi AES-GCM dùng
 * chung bởi encryptMessageForRoom (RSA-per-device) và senderKey.js/encryptWithSenderKey.
 * @param {string} text
 * @param {CryptoKey} aesKey
 * @returns {Promise<{ content: string, iv: string, tag: string }>}
 */
export const encryptTextWithKey = async (text, aesKey) => {
  if (!text) return { content: '', iv: '', tag: '' };

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encodedText = encoder.encode(text);

  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    encodedText
  );

  // Buffer chứa cả ciphertext và 16-bytes Auth Tag ở cuối trong Web Crypto API
  const ciphertextArray = new Uint8Array(ciphertextBuffer);
  const tag = ciphertextArray.slice(-16);
  const content = ciphertextArray.slice(0, -16);

  return {
    content: arrayBufferToBase64(content),
    iv: arrayBufferToBase64(iv),
    tag: arrayBufferToBase64(tag),
  };
};

export const encryptMessageForRoom = async (text, devicePublicKeys) => {
  if (!text) return { content: '', iv: '', tag: '', encryptedKeys: {} };
  const { sessionKey, encryptedKeys } = await createSessionKeyEnvelope(devicePublicKeys);
  const enc = await encryptTextWithKey(text, sessionKey);
  return { ...enc, encryptedKeys };
};

/**
 * RSA-OAEP wrap 1 raw key (session key hoặc Sender Key) riêng cho từng thiết bị. Export (dù
 * private trong e2ee.js gốc) để senderKey.js tái dùng cho wrapSenderKeyForDevices — cùng 1 phép
 * wrap, chỉ khác loại key nguồn.
 * @param {ArrayBuffer} rawKeyBuf
 * @param {Array<{ deviceId: string, publicKey: string }>} devicePublicKeys
 * @returns {object} Map deviceId -> base64 ciphertext
 */
export async function wrapKeyForDevices(rawKeyBuf, devicePublicKeys) {
  const encryptedKeys = {};
  for (const dev of devicePublicKeys) {
    try {
      if (!dev.publicKey) continue;
      const pubKey = await importPublicKey(dev.publicKey);
      const encryptedKeyBuf = await window.crypto.subtle.encrypt(
        { name: 'RSA-OAEP' },
        pubKey,
        rawKeyBuf
      );
      encryptedKeys[dev.deviceId] = arrayBufferToBase64(encryptedKeyBuf);
    } catch (err) {
      console.warn(`[E2EE] Cannot encrypt key for device ${dev.deviceId}:`, err);
    }
  }
  return encryptedKeys;
}

/**
 * RSA-OAEP unwrap 1 session key đã mã hóa riêng cho thiết bị hiện tại — tách khỏi decryptMessage
 * để ChatWindow có thể tái dùng đúng key này giải mã file đính kèm (ảnh) của cùng tin nhắn, thay
 * vì chỉ nhận được text rõ.
 * @param {string} encryptedKeyBase64
 * @param {CryptoKey} privateKey
 * @returns {Promise<CryptoKey>}
 */
export const unwrapSessionKeyForDevice = async (encryptedKeyBase64, privateKey) => {
  const encryptedKeyBuf = base64ToArrayBuffer(encryptedKeyBase64);
  const rawSessionKey = await window.crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    encryptedKeyBuf
  );
  return window.crypto.subtle.importKey(
    'raw',
    rawSessionKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
};

/**
 * Giải mã tin nhắn bằng PrivateKey của thiết bị hiện tại
 * @param {object} msg
 * @param {string} deviceId
 * @returns {string} Text rõ
 */
export const decryptMessage = async (msg, deviceId) => {
  if (!msg || !msg.content) return '';
  if (!msg.encryptedKeys) return msg.content; // Plaintext legacy fallback

  try {
    const candidates = [deviceId, ...listHistoryKeyIds()];
    for (const keyId of candidates) {
      const encryptedKeyBase64 = msg.encryptedKeys[keyId] || msg.encryptedKeys.get?.(keyId);
      if (!encryptedKeyBase64) continue;
      const privateKey = keyId === deviceId ? await getPrivateKey(keyId) : await getHistoryKey(keyId);
      if (!privateKey) continue;
      try {
        const sessionKey = await unwrapSessionKeyForDevice(encryptedKeyBase64, privateKey);
        return await decryptAesGcmContent(msg, sessionKey);
      } catch { /* thử key lịch sử tiếp theo */ }
    }
    return '[Không thể giải mã tin nhắn — Thiết bị này chưa được mã hóa khóa]';
  } catch (err) {
    console.error('[E2EE] Decryption error:', err);
    return '[Lỗi Giải Mã Tin Nhắn]';
  }
};

// Alias public gọi thẳng bước AES-GCM cuối khi đã tự resolve key — senderKey.js tái dùng cho decryptWithSenderKey.
export const decryptContentWithKey = (msg, aesKey) => decryptAesGcmContent(msg, aesKey);

// Gộp content + tag (định dạng Web Crypto API) rồi AES-GCM giải mã bằng key đã sẵn sàng.
async function decryptAesGcmContent(msg, aesKey) {
  const contentBuf = base64ToArrayBuffer(msg.content);
  const tagBuf = base64ToArrayBuffer(msg.tag);
  const ivBuf = base64ToArrayBuffer(msg.iv);

  const combinedBuf = new Uint8Array(contentBuf.byteLength + tagBuf.byteLength);
  combinedBuf.set(new Uint8Array(contentBuf), 0);
  combinedBuf.set(new Uint8Array(tagBuf), contentBuf.byteLength);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBuf },
    aesKey,
    combinedBuf
  );
  return new TextDecoder().decode(decryptedBuffer);
}
