import { Capacitor, registerPlugin } from '@capacitor/core';
import { decryptFileWithKey } from '../crypto';
import { getAttachmentDownloadUrl } from '../api/rooms.api';
import { getAttachmentCiphertext, saveAttachmentCiphertext } from '../storage/attachmentStore';
import { arrayBufferToBase64 } from '../crypto/base64';

const AttachmentDownload = registerPlugin('AttachmentDownload');

export function attachmentPointer(message) {
  try {
    const pointer = JSON.parse(message.decryptedText || '');
    return pointer?.attachmentId && pointer?.iv ? pointer : null;
  } catch {
    return null;
  }
}

export function attachmentLimit(type) {
  return type === 'image' || type === 'audio' ? 10 * 1024 * 1024 : 25 * 1024 * 1024;
}

export function attachmentFileName(message, pointer) {
  const name = typeof pointer?.name === 'string'
    ? pointer.name
    : typeof message.fileName === 'string' ? message.fileName : 'tep-dinh-kem';
  return name.replace(/[\\/:*?"<>|]/g, '-') || 'tep-dinh-kem';
}

// Server chỉ nhận ciphertext nên không biết mimetype thật — tự đoán theo đuôi file để Blob render đúng.
const EXT_MIME_MAP = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  txt: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  mp4: 'video/mp4',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};
export function guessMimeType(fileName) {
  const ext = fileName?.split('.').pop()?.toLowerCase();
  return EXT_MIME_MAP[ext] || 'application/octet-stream';
}

// Lấy ciphertext gốc (từ cache, hoặc tải từ server nếu chưa hết hạn) — dùng chung cho hiển thị
// lẫn backup, không cần key giải mã.
export async function getRawAttachmentCiphertext(message, userId) {
  const pointer = attachmentPointer(message);
  if (!pointer) throw new Error('Không có metadata attachment');
  const roomId = message.room?._id || message.room;
  const ciphertext = await getAttachmentCiphertext(userId, roomId, pointer.attachmentId)
    || await (async () => {
      const url = await getAttachmentDownloadUrl(roomId, pointer.attachmentId);
      const res = await fetch(url);
      if (!res.ok) throw new Error('Không tải được file');
      const downloaded = await res.arrayBuffer();
      await saveAttachmentCiphertext(userId, roomId, pointer.attachmentId, downloaded).catch(() => {});
      return downloaded;
    })();
  return { ciphertext, pointer, roomId };
}

export async function getDecryptedAttachmentBlob(message, userId) {
  if (!message.__key) throw new Error('Không có khóa giải mã');
  const { ciphertext, pointer } = await getRawAttachmentCiphertext(message, userId);
  const decrypted = await decryptFileWithKey(ciphertext, pointer.iv, message.__key, {
    maxOriginalSize: attachmentLimit(message.type),
  });
  return {
    blob: new Blob([decrypted.arrayBuffer], { type: pointer.mimeType || decrypted.mimeType || guessMimeType(message.fileName) }),
    fileName: attachmentFileName(message, pointer),
  };
}

export function downloadBlob(blob, fileName) {
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = fileName;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

export async function saveDecryptedBlob(blob, fileName, fileHandle) {
  if (Capacitor.isNativePlatform()) {
    await AttachmentDownload.save({
      data: arrayBufferToBase64(await blob.arrayBuffer()),
      fileName,
      mimeType: blob.type || 'application/octet-stream',
    });
    return true;
  }
  if (fileHandle) {
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
  } else {
    downloadBlob(blob, fileName);
  }
  return true;
}
