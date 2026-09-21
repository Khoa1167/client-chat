/**
 * Mã hóa file đính kèm (ảnh/audio/file chung) bằng AES key đã có sẵn của tin nhắn — dùng đúng
 * Sender Key của thiết bị gửi/epoch đã dùng để mã hóa phần text của cùng tin nhắn, không
 * sinh/bọc thêm key riêng cho file.
 * Không tách content/tag như encryptTextWithKey vì file chỉ cần upload/tải nguyên khối, không
 * cần lưu 2 field riêng như message.content/message.tag trong DB.
 */

import { arrayBufferToBase64, base64ToArrayBuffer } from './base64';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const HEADER_MAX_BYTES = 4096;
const COMPRESSIBLE_MIME = new Set([
  'application/json', 'application/xml', 'application/javascript', 'application/x-javascript',
  'text/csv', 'text/markdown', 'text/plain', 'text/xml', 'text/yaml',
]);

function shouldTryCompression(mimeType, size) {
  return size >= 256 * 1024 && (mimeType?.startsWith('text/') || COMPRESSIBLE_MIME.has(mimeType));
}

function padSize(size) {
  if (size <= 16 * 1024) return 16 * 1024;
  if (size <= 1024 * 1024) return Math.ceil(size / (64 * 1024)) * 64 * 1024;
  if (size <= 10 * 1024 * 1024) return Math.ceil(size / (256 * 1024)) * 256 * 1024;
  return Math.ceil(size / (1024 * 1024)) * 1024 * 1024;
}

function fillRandom(bytes, start) {
  for (let offset = start; offset < bytes.length; offset += 65536) {
    window.crypto.getRandomValues(bytes.subarray(offset, Math.min(offset + 65536, bytes.length)));
  }
}

async function gzip(arrayBuffer) {
  if (typeof CompressionStream !== 'function') return null;
  return new Response(new Blob([arrayBuffer]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
}

async function gunzip(arrayBuffer) {
  if (typeof DecompressionStream !== 'function') throw new Error('Trình duyệt không hỗ trợ giải nén attachment');
  return new Response(new Blob([arrayBuffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

// Header và random padding đều được AES-GCM bảo vệ. R2 chỉ thấy ciphertext đã làm tròn kích thước.
export const encryptFileWithKey = async (arrayBuffer, aesKey, { mimeType = '', maxCiphertextSize } = {}) => {
  const original = arrayBuffer instanceof ArrayBuffer ? arrayBuffer : arrayBuffer.buffer;
  let payload = original;
  let compression = 'none';
  if (shouldTryCompression(mimeType, original.byteLength)) {
    const compressed = await gzip(original);
    if (compressed && compressed.byteLength <= original.byteLength * 0.9) {
      payload = compressed;
      compression = 'gzip';
    }
  }

  const header = encoder.encode(JSON.stringify({
    v: 2,
    compression,
    originalSize: original.byteLength,
    payloadSize: payload.byteLength,
    mimeType: typeof mimeType === 'string' ? mimeType.slice(0, 120) : '',
  }));
  if (header.byteLength > HEADER_MAX_BYTES) throw new Error('Metadata attachment quá lớn');

  const packedSize = 4 + header.byteLength + payload.byteLength;
  const paddedSize = padSize(packedSize);
  // AES-GCM thêm authentication tag 16 byte ở cuối ciphertext.
  if (!Number.isSafeInteger(maxCiphertextSize) || paddedSize + 16 > maxCiphertextSize) {
    throw new Error('File vượt quá giới hạn sau khi padding');
  }

  const packed = new Uint8Array(paddedSize);
  new DataView(packed.buffer).setUint32(0, header.byteLength);
  packed.set(header, 4);
  packed.set(new Uint8Array(payload), 4 + header.byteLength);
  fillRandom(packed, packedSize);

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, packed);
  return { ciphertext, iv: arrayBufferToBase64(iv) };
};

export const decryptFileWithKey = async (ciphertextArrayBuffer, ivBase64, aesKey, { maxOriginalSize } = {}) => {
  const iv = base64ToArrayBuffer(ivBase64);
  const packed = new Uint8Array(await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertextArrayBuffer));
  if (packed.byteLength < 4) throw new Error('Attachment không hợp lệ');
  const headerLength = new DataView(packed.buffer, packed.byteOffset, packed.byteLength).getUint32(0);
  if (headerLength < 2 || headerLength > HEADER_MAX_BYTES || 4 + headerLength > packed.byteLength) {
    throw new Error('Header attachment không hợp lệ');
  }

  let header;
  try {
    header = JSON.parse(decoder.decode(packed.subarray(4, 4 + headerLength)));
  } catch {
    throw new Error('Không đọc được metadata attachment');
  }
  if (header?.v !== 2 || !Number.isSafeInteger(header.payloadSize) || !Number.isSafeInteger(header.originalSize)
    || header.payloadSize < 0 || header.originalSize < 0 || 4 + headerLength + header.payloadSize > packed.byteLength
    || !Number.isSafeInteger(maxOriginalSize) || header.originalSize > maxOriginalSize) {
    throw new Error('Kích thước attachment không hợp lệ');
  }

  const payload = packed.slice(4 + headerLength, 4 + headerLength + header.payloadSize).buffer;
  const plain = header.compression === 'gzip' ? await gunzip(payload) : payload;
  if (plain.byteLength !== header.originalSize) throw new Error('Attachment giải nén không hợp lệ');
  return { arrayBuffer: plain, mimeType: header.mimeType || 'application/octet-stream' };
};
