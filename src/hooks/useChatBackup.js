import { useState } from 'react';
import { iterateAllCachedMessages, mergeCachedMessages } from '../crypto';
import { resolveMessageKey } from '../crypto/resolveMessageKey';
import { storeSenderKey } from '../crypto/senderKey';
import { encryptBackupPayload, decryptBackupFile } from '../crypto/chatBackup';
import { arrayBufferToBase64, base64ToArrayBuffer } from '../crypto/base64';
import { attachmentPointer, getRawAttachmentCiphertext } from '../utils/attachmentDecrypt';
import { saveAttachmentCiphertext } from '../storage/attachmentStore';

const ATTACHMENT_TYPES = ['image', 'file', 'audio'];

function roomIdOf(message) {
  return (message.room?._id || message.room)?.toString();
}

// Nhúng ciphertext gốc + Sender Key (base64) vào tin nhắn đính kèm — để backup tự chứa, không
// phụ thuộc server còn giữ ciphertext hay không. Thất bại thì giữ nguyên tin (chỉ mất phần đính kèm).
async function embedAttachment(message, userId) {
  if (!ATTACHMENT_TYPES.includes(message.type) || message.isDeleted) return { message, skipped: false };
  try {
    const roomId = roomIdOf(message);
    const key = message.__key || await resolveMessageKey(roomId, message);
    if (!key) return { message, skipped: true };
    const { ciphertext } = await getRawAttachmentCiphertext({ ...message, room: roomId }, userId);
    const rawKey = await window.crypto.subtle.exportKey('raw', key);
    return {
      message: {
        ...message,
        attachmentCiphertextBase64: arrayBufferToBase64(ciphertext),
        attachmentKeyBase64: arrayBufferToBase64(rawKey),
      },
      skipped: false,
    };
  } catch {
    return { message, skipped: true };
  }
}

export default function useChatBackup(user) {
  const [progress, setProgress] = useState(null);

  const exportBackup = async (passphrase) => {
    const messages = [];
    let skippedCount = 0;
    let processed = 0;

    for await (const batch of iterateAllCachedMessages(user._id, 100)) {
      for (const msg of batch) {
        const { message, skipped } = await embedAttachment(msg, user._id);
        messages.push(message);
        if (skipped) skippedCount += 1;
        processed += 1;
        setProgress({ phase: 'export', processed });
      }
    }

    const envelope = await encryptBackupPayload({ messages }, passphrase);
    setProgress(null);
    return { envelope, messageCount: messages.length, skippedCount };
  };

  const restoreBackup = async (envelope, passphrase) => {
    const { messages } = await decryptBackupFile(envelope, passphrase);
    const byRoom = new Map();
    let processed = 0;

    for (const msg of messages) {
      const roomId = roomIdOf(msg);
      const { attachmentCiphertextBase64, attachmentKeyBase64, ...restMsg } = msg;

      if (attachmentCiphertextBase64 && attachmentKeyBase64) {
        try {
          const pointer = attachmentPointer(msg);
          const ciphertext = base64ToArrayBuffer(attachmentCiphertextBase64);
          const rawKey = base64ToArrayBuffer(attachmentKeyBase64);
          const cryptoKey = await window.crypto.subtle.importKey(
            'raw', rawKey, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
          );
          await saveAttachmentCiphertext(user._id, roomId, pointer.attachmentId, ciphertext);
          await storeSenderKey(roomId, msg.senderDeviceId, msg.epoch, cryptoKey);
        } catch (err) {
          console.error('[Backup] Không thể khôi phục đính kèm:', err);
        }
      }

      if (!byRoom.has(roomId)) byRoom.set(roomId, []);
      byRoom.get(roomId).push(restMsg);
      processed += 1;
      setProgress({ phase: 'restore', processed });
    }

    for (const [roomId, roomMessages] of byRoom) {
      await mergeCachedMessages(user._id, roomId, roomMessages);
    }

    setProgress(null);
    return { messageCount: messages.length, roomCount: byRoom.size };
  };

  return { progress, exportBackup, restoreBackup };
}
