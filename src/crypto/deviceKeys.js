import { safeGet, safeSet } from '../utils/safeStorage';

/**
 * Quản lý cặp khóa RSA-OAEP 2048-bit của thiết bị (IndexedDB), Device ID, và xuất/nhập Public
 * Key dạng JWK.
 */

const DB_NAME = 'ChatAppE2EE';
const DB_VERSION = 1;
const STORE_NAME = 'privateKeys';

// ─── Quản lý IndexedDB cho Private Keys ────────────────────────────────────
const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
};

export const storePrivateKey = async (deviceId, privateKey) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(privateKey, deviceId);
    req.onsuccess = () => resolve(true);
    req.onerror = (e) => reject(e.target.error);
  });
};

export const getPrivateKey = async (deviceId) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(deviceId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = (e) => reject(e.target.error);
  });
};

export const listStoredKeyIds = async () => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAllKeys();
    req.onsuccess = () => resolve(req.result.filter(key => typeof key === 'string'));
    req.onerror = (e) => reject(e.target.error);
  });
};

const HISTORY_KEYRING = 'chat_history_keyring_v1';
const getHistoryKeyring = () => {
  try { return JSON.parse(safeGet(localStorage, HISTORY_KEYRING) || '{}'); } catch { return {}; }
};

// Khóa lịch sử luôn nằm ở entry riêng: không thể vô tình được initDeviceKey() dùng để gửi mới.
export const storeHistoryKey = async (originalKeyId, key) => {
  const storageKey = `history_${crypto.randomUUID?.() || Date.now().toString(36)}`;
  await storePrivateKey(storageKey, key);
  const keyring = getHistoryKeyring();
  keyring[originalKeyId] = storageKey;
  if (!safeSet(localStorage, HISTORY_KEYRING, JSON.stringify(keyring))) throw new Error('Không thể lưu keyring lịch sử');
};

export const getHistoryKey = async (originalKeyId) => {
  const storageKey = getHistoryKeyring()[originalKeyId];
  return storageKey ? getPrivateKey(storageKey) : null;
};

export const listHistoryKeyIds = () => Object.keys(getHistoryKeyring());

export const storePublicKey = async (deviceId, publicKey) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(publicKey, `public_${deviceId}`);
    req.onsuccess = () => resolve(true);
    req.onerror = (e) => reject(e.target.error);
  });
};

export const getPublicKey = async (deviceId) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(`public_${deviceId}`);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = (e) => reject(e.target.error);
  });
};

// ─── Device ID ──────────────────────────────────────────────────────────────
export const getDeviceId = () => {
  let deviceId = safeGet(localStorage, 'chat_device_id');
  if (!deviceId) {
    deviceId = 'dev_' + Array.from(window.crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    safeSet(localStorage, 'chat_device_id', deviceId);
  }
  return deviceId;
};

// Tách identity của phiên thiết bị khỏi identity dùng để mở envelope E2EE.
// Mặc định bằng deviceId để tương thích toàn bộ lịch sử hiện hữu.
export const getE2eeKeyId = () => safeGet(localStorage, 'chat_e2ee_key_id') || getDeviceId();
export const setE2eeKeyId = (keyId) => safeSet(localStorage, 'chat_e2ee_key_id', keyId);

// ─── Sinh Cặp khóa RSA-OAEP 2048-bit ────────────────────────────────────────
export const generateKeyPair = async () => {
  return await window.crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true, // privateKey extractable để backup/recovery
    ['encrypt', 'decrypt']
  );
};

export const exportPublicKey = async (publicKey) => {
  const exported = await window.crypto.subtle.exportKey('jwk', publicKey);
  return JSON.stringify(exported);
};

export const importPublicKey = async (jwkString) => {
  const jwk = typeof jwkString === 'string' ? JSON.parse(jwkString) : jwkString;
  return await window.crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['encrypt']
  );
};

export const exportPublicKeyFromPrivateKey = async (privateKey) => {
  const privateJwk = await window.crypto.subtle.exportKey('jwk', privateKey);
  const publicJwk = {
    kty: privateJwk.kty,
    n: privateJwk.n,
    e: privateJwk.e,
    ext: true
  };
  return JSON.stringify(publicJwk);
};
