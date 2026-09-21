import { decryptContentWithKey } from './sessionKey';
import { resolveMessageKey } from './resolveMessageKey';

// Giải mã 1 tin nhắn, tự nhận diện scheme — trả cả key resolved (__key) để tái dùng cho file đính kèm/forward.
export async function decryptIncomingMessage(roomId, msg) {
  if (!msg.content) return { text: '', key: null };
  try {
    const key = await resolveMessageKey(roomId, msg);
    if (!key) {
      return {
        text: '[Không thể giải mã tin nhắn — Thiết bị này chưa được phân phối Sender Key]',
        key: null,
      };
    }
    const text = await decryptContentWithKey(msg, key);
    return { text, key };
  } catch (err) {
    console.error('[E2EE] Decryption error:', err);
    return { text: '[Lỗi Giải Mã Tin Nhắn]', key: null };
  }
}

// replyTo là sub-object ciphertext riêng của server, không tự giải mã theo message cha — phải giải mã
// riêng, chỉ cần cho type 'text' (ảnh/audio/file đã có nhãn tĩnh, không cần đọc content).
export async function decryptReplyToPreview(roomId, replyToMsg) {
  if (!replyToMsg || replyToMsg.isDeleted || replyToMsg.type !== 'text' || !replyToMsg.content) return replyToMsg;
  const { text } = await decryptIncomingMessage(roomId, replyToMsg);
  return { ...replyToMsg, content: text };
}

export async function decryptPollVotes(roomId, pollVotes) {
  if (!pollVotes) return {};
  const entries = pollVotes instanceof Map ? [...pollVotes.entries()] : Object.entries(pollVotes);
  const decrypted = await Promise.all(entries.map(async ([voterId, vote]) => {
    const { text } = await decryptIncomingMessage(roomId, vote);
    return [voterId, text];
  }));
  return Object.fromEntries(decrypted);
}

export async function processDecryption(roomId, rawMessages) {
  return Promise.all(
    rawMessages.map(async (m) => {
      if (m.isDeleted) return m;
      if (m.rawContent) return m;
      const { text, key } = await decryptIncomingMessage(roomId, m);
      const replyToMsg = await decryptReplyToPreview(roomId, m.replyTo);
      const pollVotes = m.type === 'poll' ? await decryptPollVotes(roomId, m.pollVotes) : undefined;
      // rawContent giữ ciphertext gốc — ReportModal cần hash đúng bản mã này, không phải plaintext.
      return { ...m, replyTo: replyToMsg, pollVotes, decryptedText: text, content: text, rawContent: m.content, __key: key };
    })
  );
}
