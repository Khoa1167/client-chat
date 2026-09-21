import { arrayBufferToBase64, base64ToArrayBuffer } from './base64';

const MAGIC = 'CHATAPP_BACKUP';
const VERSION = 1;
const PBKDF2_ITERATIONS = 210000;

async function deriveBackupKey(passphrase, saltBuffer, iterations) {
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']
  );
  return window.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBuffer, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Mã hóa payload (đối tượng JS bất kỳ) bằng passphrase — trả envelope sẵn sàng JSON.stringify + tải file.
// exportedAt nằm NGOÀI phần mã hóa để UI restore đọc được trước khi nhập passphrase.
export async function encryptBackupPayload(payload, passphrase) {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveBackupKey(passphrase, salt, PBKDF2_ITERATIONS);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

  return {
    magic: MAGIC,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    salt: arrayBufferToBase64(salt),
    iterations: PBKDF2_ITERATIONS,
    iv: arrayBufferToBase64(iv),
    ciphertext: arrayBufferToBase64(ciphertext),
  };
}

// Giải mã envelope bằng passphrase — ném lỗi rõ ràng nếu sai định dạng hoặc sai passphrase
// (AES-GCM tự phát hiện qua auth tag, không cần đoán mò).
export async function decryptBackupFile(envelope, passphrase) {
  if (envelope?.magic !== MAGIC) throw new Error('Không phải tệp sao lưu hợp lệ');

  const salt = base64ToArrayBuffer(envelope.salt);
  const iv = base64ToArrayBuffer(envelope.iv);
  const ciphertext = base64ToArrayBuffer(envelope.ciphertext);
  const key = await deriveBackupKey(passphrase, salt, envelope.iterations || PBKDF2_ITERATIONS);

  let plaintext;
  try {
    plaintext = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  } catch {
    throw new Error('Sai passphrase hoặc tệp sao lưu bị hỏng');
  }
  return JSON.parse(new TextDecoder().decode(plaintext));
}
