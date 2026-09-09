import { arrayBufferToBase64, base64ToArrayBuffer } from './base64';
import { getDeviceId, getE2eeKeyId, getPrivateKey, listStoredKeyIds, storeHistoryKey } from './deviceKeys';

const toBase64Url = (bytes) => arrayBufferToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (value) => base64ToArrayBuffer(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));

export const generateHistoryRecoveryKey = () => toBase64Url(crypto.getRandomValues(new Uint8Array(32)));

const exportStoredKey = async (keyId) => {
  const key = await getPrivateKey(keyId);
  if (!key) return null;
  if (key.algorithm.name === 'RSA-OAEP') {
    return { keyId, type: 'rsa', data: arrayBufferToBase64(await crypto.subtle.exportKey('pkcs8', key)) };
  }
  if (key.algorithm.name === 'AES-GCM') {
    return { keyId, type: 'aes', data: arrayBufferToBase64(await crypto.subtle.exportKey('raw', key)) };
  }
  return null;
};

export const createEncryptedHistoryBackup = async (recoveryKey) => {
  if (typeof recoveryKey !== 'string' || recoveryKey.length < 40) throw new Error('Mã khôi phục không hợp lệ');
  const e2eeKeyId = getE2eeKeyId();
  const keyIds = await listStoredKeyIds();
  const selectedIds = keyIds.filter(keyId => keyId === e2eeKeyId || keyId.startsWith('senderkey_'));
  const keys = (await Promise.all(selectedIds.map(exportStoredKey))).filter(Boolean);
  if (!keys.some(key => key.keyId === e2eeKeyId && key.type === 'rsa')) throw new Error('Không tìm thấy khóa E2EE của thiết bị này');

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey('raw', fromBase64Url(recoveryKey), { name: 'AES-GCM' }, false, ['encrypt']);
  const plaintext = new TextEncoder().encode(JSON.stringify({ version: 1, createdAt: new Date().toISOString(), sourceDeviceId: getDeviceId(), sourceE2eeKeyId: e2eeKeyId, keys }));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return { ciphertext: arrayBufferToBase64(ciphertext), iv: arrayBufferToBase64(iv), sourceDeviceId: getDeviceId(), sourceE2eeKeyId: e2eeKeyId };
};

export const restoreEncryptedHistoryBackup = async (backup, recoveryKey) => {
  try {
    const key = await crypto.subtle.importKey('raw', fromBase64Url(recoveryKey.trim()), { name: 'AES-GCM' }, false, ['decrypt']);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToArrayBuffer(backup.iv) }, key, base64ToArrayBuffer(backup.ciphertext));
    const bundle = JSON.parse(new TextDecoder().decode(plaintext));
    if (bundle.version !== 1 || !Array.isArray(bundle.keys) || !bundle.keys.length) throw new Error('invalid bundle');
    for (const entry of bundle.keys) {
      if (!entry?.keyId || !['rsa', 'aes'].includes(entry.type) || typeof entry.data !== 'string') throw new Error('invalid key');
      const keyMaterial = base64ToArrayBuffer(entry.data);
      const keyToStore = entry.type === 'rsa'
        ? await crypto.subtle.importKey('pkcs8', keyMaterial, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['decrypt'])
        : await crypto.subtle.importKey('raw', keyMaterial, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
      await storeHistoryKey(entry.keyId, keyToStore);
    }
    return bundle.keys.length;
  } catch {
    throw new Error('Mã khôi phục hoặc bản sao lưu không chính xác.');
  }
};
