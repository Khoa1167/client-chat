/**
 * Mã hóa file đính kèm (ảnh/audio/file chung) bằng AES key đã có sẵn của tin nhắn — dùng đúng
 * session key (DM) hoặc Sender Key (nhóm) đã dùng để mã hóa phần text của cùng tin nhắn, không
 * sinh/bọc thêm 1 key riêng cho file, tránh tốn thêm 1 vòng RSA-wrap mỗi ảnh.
 * Không tách content/tag như encryptTextWithKey vì file chỉ cần upload/tải nguyên khối, không
 * cần lưu 2 field riêng như message.content/message.tag trong DB.
 */

import { arrayBufferToBase64, base64ToArrayBuffer } from './base64';

export const encryptFileWithKey = async (arrayBuffer, aesKey) => {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, arrayBuffer);
  return { ciphertext, iv: arrayBufferToBase64(iv) };
};

export const decryptFileWithKey = async (ciphertextArrayBuffer, ivBase64, aesKey) => {
  const iv = base64ToArrayBuffer(ivBase64);
  return window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertextArrayBuffer);
};
