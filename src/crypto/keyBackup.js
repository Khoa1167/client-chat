// Passphrase Backup & Recovery (PBKDF2 600k iterations) — xuất/nhập private key thiết bị bằng
// mật khẩu tự chọn, cho phép khôi phục E2EE key khi đổi/thêm thiết bị.

import { arrayBufferToBase64, base64ToArrayBuffer } from './base64';

export const exportPrivateKeyEncrypted = async (privateKey, publicKeyJWK, passphrase) => {
  if (!passphrase || passphrase.length < 12) {
    throw new Error('Passphrase phải có độ dài tối thiểu 12 ký tự.');
  }

  // 1. Export privateKey sang PKCS8
  const exportedPrivateKey = await window.crypto.subtle.exportKey('pkcs8', privateKey);

  // 2. Derive encryption key từ passphrase sử dụng PBKDF2 600,000 iterations
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const passphraseKey = await window.crypto.subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
  );

  const derivedKey = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 600000,
      hash: 'SHA-256'
    },
    passphraseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encryptedPrivateKey = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    derivedKey,
    exportedPrivateKey
  );

  const backupData = {
    salt: arrayBufferToBase64(salt),
    iv: arrayBufferToBase64(iv),
    data: arrayBufferToBase64(encryptedPrivateKey),
    publicKey: publicKeyJWK || null,
  };

  return btoa(JSON.stringify(backupData));
};

export const importPrivateKeyFromBackup = async (backupString, passphrase) => {
  try {
    const backupData = JSON.parse(atob(backupString));
    const salt = base64ToArrayBuffer(backupData.salt);
    const iv = base64ToArrayBuffer(backupData.iv);
    const encryptedData = base64ToArrayBuffer(backupData.data);

    const enc = new TextEncoder();
    const passphraseKey = await window.crypto.subtle.importKey(
      'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
    );

    const derivedKey = await window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: 600000,
        hash: 'SHA-256'
      },
      passphraseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    const decryptedPKCS8 = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      derivedKey,
      encryptedData
    );

    const privateKey = await window.crypto.subtle.importKey(
      'pkcs8',
      decryptedPKCS8,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      true,
      ['decrypt']
    );

    return {
      privateKey,
      publicKey: backupData.publicKey || null,
    };
  } catch {
    throw new Error('Mật khẩu giải mã hoặc tệp sao lưu không chính xác.');
  }
};
