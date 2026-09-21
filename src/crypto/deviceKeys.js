import { safeGet, safeSet } from '../utils/safeStorage.js';

/**
 * Quản lý cặp khóa RSA-OAEP 2048-bit của thiết bị (IndexedDB), Device ID, và xuất/nhập Public
 * Key dạng JWK.
 */

const DB_NAME = 'ChatAppE2EE';
const DB_VERSION = 1;
const STORE_NAME = 'privateKeys';
let activeUserId = safeGet(localStorage, 'chat_active_user_id');

const requireUserId = () => {
  if (!activeUserId) throw new Error('Chưa xác định tài khoản cho kho khóa thiết bị');
  return activeUserId;
};

const scopedKey = key => `${requireUserId()}:${key}`;

export const setCryptoUserId = (userId) => {
  activeUserId = userId ? String(userId) : null;
  if (activeUserId) safeSet(localStorage, 'chat_active_user_id', activeUserId);
  else localStorage.removeItem('chat_active_user_id');
  localStorage.removeItem('chat_device_id');
  localStorage.removeItem('chat_e2ee_key_id');
};

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
    const req = store.put(privateKey, scopedKey(deviceId));
    req.onsuccess = () => resolve(true);
    req.onerror = (e) => reject(e.target.error);
  });
};

export const getPrivateKey = async (deviceId) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(scopedKey(deviceId));
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = (e) => reject(e.target.error);
  });
};

export const listStoredKeyIds = async () => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAllKeys();
    req.onsuccess = () => {
      const prefix = `${requireUserId()}:`;
      resolve(req.result.filter(key => typeof key === 'string' && key.startsWith(prefix))
        .map(key => key.slice(prefix.length)));
    };
    req.onerror = (e) => reject(e.target.error);
  });
};

const historyKeyringName = () => `chat_history_keyring_v1_${requireUserId()}`;
const getHistoryKeyring = () => {
  try { return JSON.parse(safeGet(localStorage, historyKeyringName()) || '{}'); } catch { return {}; }
};

// Khóa lịch sử luôn nằm ở entry riêng: không thể vô tình được initDeviceKey() dùng để gửi mới.
export const storeHistoryKey = async (originalKeyId, key) => {
  const storageKey = `history_${crypto.randomUUID?.() || Date.now().toString(36)}`;
  await storePrivateKey(storageKey, key);
  const keyring = getHistoryKeyring();
  keyring[originalKeyId] = storageKey;
  if (!safeSet(localStorage, historyKeyringName(), JSON.stringify(keyring))) throw new Error('Không thể lưu keyring lịch sử');
};

export const getHistoryKey = async (originalKeyId) => {
  const storageKey = getHistoryKeyring()[originalKeyId];
  return storageKey ? getPrivateKey(storageKey) : null;
};

export const listHistoryKeyIds = () => Object.keys(getHistoryKeyring());

export const clearUserCryptoData = async () => {
  const userId = requireUserId();
  const prefix = `${userId}:`;
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const request = tx.objectStore(STORE_NAME).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if (typeof cursor.key === 'string' && cursor.key.startsWith(prefix)) cursor.delete();
      cursor.continue();
    };
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  localStorage.removeItem(`chat_device_id_${userId}`);
  localStorage.removeItem(`chat_e2ee_key_id_${userId}`);
  localStorage.removeItem(historyKeyringName());
};

export const storePublicKey = async (deviceId, publicKey) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(publicKey, scopedKey(`public_${deviceId}`));
    req.onsuccess = () => resolve(true);
    req.onerror = (e) => reject(e.target.error);
  });
};

export const getPublicKey = async (deviceId) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(scopedKey(`public_${deviceId}`));
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = (e) => reject(e.target.error);
  });
};

// ─── Device ID ──────────────────────────────────────────────────────────────
export const getDeviceId = () => {
  const userId = requireUserId();
  const storageKey = `chat_device_id_${userId}`;
  let deviceId = safeGet(localStorage, storageKey);
  if (!deviceId) {
    deviceId = 'dev_' + Array.from(window.crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    safeSet(localStorage, storageKey, deviceId);
  }
  return deviceId;
};

// Tách identity của phiên thiết bị khỏi identity dùng để mở envelope E2EE.
// Mặc định bằng deviceId để tương thích toàn bộ lịch sử hiện hữu.
export const getE2eeKeyId = () => safeGet(localStorage, `chat_e2ee_key_id_${requireUserId()}`) || getDeviceId();
export const setE2eeKeyId = (keyId) => safeSet(localStorage, `chat_e2ee_key_id_${requireUserId()}`, keyId);

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

export const exportSenderKeys = async () => {
  const keyIds = await listStoredKeyIds();
  const keys = await Promise.all(keyIds.filter(keyId => keyId.startsWith('senderkey_')).map(async keyId => {
    const key = await getPrivateKey(keyId);
    if (!key || key.algorithm.name !== 'AES-GCM') return null;
    return { keyId, raw: await window.crypto.subtle.exportKey('raw', key) };
  }));
  return keys.filter(Boolean);
};

export const importSenderKeys = async (entries) => {
  if (!Array.isArray(entries)) return;
  for (const entry of entries) {
    if (!entry?.keyId?.startsWith('senderkey_') || !(entry.raw instanceof ArrayBuffer)) continue;
    const key = await window.crypto.subtle.importKey('raw', entry.raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
    await storePrivateKey(entry.keyId, key);
  }
};
