import { importPublicKey } from './deviceKeys';
import { arrayBufferToBase64, base64ToArrayBuffer } from './base64';

// Primitives dùng cho Sender Key. RSA chỉ bọc Sender Key khi phân phối theo epoch,
// không bọc khóa riêng cho từng tin nhắn.
export const encryptTextWithKey = async (text, aesKey) => {
  if (!text) return { content: '', iv: '', tag: '' };

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, aesKey, new TextEncoder().encode(text)
  ));

  return {
    content: arrayBufferToBase64(ciphertext.slice(0, -16)),
    iv: arrayBufferToBase64(iv),
    tag: arrayBufferToBase64(ciphertext.slice(-16)),
  };
};

export async function wrapKeyForDevices(rawKeyBuf, devicePublicKeys) {
  const encryptedKeys = {};
  for (const dev of devicePublicKeys) {
    try {
      if (!dev.publicKey) continue;
      const encrypted = await window.crypto.subtle.encrypt(
        { name: 'RSA-OAEP' }, await importPublicKey(dev.publicKey), rawKeyBuf
      );
      encryptedKeys[dev.deviceId] = arrayBufferToBase64(encrypted);
    } catch (err) {
      console.warn(`[E2EE] Cannot encrypt key for device ${dev.deviceId}:`, err);
    }
  }
  return encryptedKeys;
}

export const decryptContentWithKey = async (msg, aesKey) => {
  const content = new Uint8Array(base64ToArrayBuffer(msg.content));
  const tag = new Uint8Array(base64ToArrayBuffer(msg.tag));
  const combined = new Uint8Array(content.length + tag.length);
  combined.set(content);
  combined.set(tag, content.length);
  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToArrayBuffer(msg.iv) }, aesKey, combined
  );
  return new TextDecoder().decode(decrypted);
};
