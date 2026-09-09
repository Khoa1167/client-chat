import { useState, useEffect, useRef, useCallback } from 'react';
import { getRoomMessages, getSenderKeyDoc } from '../../api/rooms.api';
import {
  getDeviceId, getPrivateKey, getHistoryKey, listHistoryKeyIds, getSenderKey,
  unwrapSenderKey, unwrapSessionKeyForDevice, decryptContentWithKey, storeSenderKey,
} from '../../crypto';
import { toast } from '../../components/common/toastStore';

// Chỉ cho thu hồi tin nhắn trong vòng 24h — khớp RECALL_WINDOW_MS phía server
// (server/src/socket/handlers/message.handler.js), chỉ dùng để không hiện nút Edit quá hạn ở UI.

// Quản lý danh sách tin nhắn: tải/phân trang, giải mã E2EE, socket event message:*/typing:*, react/edit.
export default function useChatMessages(room, user, { emit, on, isConnected }, { bottomRef, encryptForRoom }) {
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [typing, setTyping] = useState([]);
  const [replyTo, setReplyTo] = useState(null);
  // Mốc đối phương đọc gần nhất (chỉ DM) — khởi tạo từ room (đã tính sẵn server-side), cập nhật live qua 'room:read'.
  const [partnerReadAt, setPartnerReadAt] = useState(room?.partnerReadAt ? new Date(room.partnerReadAt) : null);
  // Tin nhắn tự hủy — id đã hẹn giờ ẩn rồi, tránh đặt setTimeout trùng mỗi lần messages đổi
  const scheduledExpiryRef = useRef(new Set());

  // Resolve AES key (session key DM / Sender Key nhóm) — tách riêng để tái dùng giải mã file đính kèm cùng tin.
  const resolveMessageKey = async (msg) => {
    const devId = getDeviceId();

    if (msg.scheme !== 'sender-key') {
      if (!msg.encryptedKeys) return null; // Plaintext legacy fallback — không có key để resolve
      for (const keyId of [devId, ...listHistoryKeyIds()]) {
        const encryptedKeyBase64 = msg.encryptedKeys[keyId] || msg.encryptedKeys.get?.(keyId);
        if (!encryptedKeyBase64) continue;
        const privateKey = keyId === devId ? await getPrivateKey(keyId) : await getHistoryKey(keyId);
        if (privateKey) return unwrapSessionKeyForDevice(encryptedKeyBase64, privateKey);
      }
      return null;
    }

    let senderKey = await getSenderKey(room._id, msg.senderDeviceId, msg.epoch);
    if (senderKey) return senderKey;

    const dist = await getSenderKeyDoc(room._id, { epoch: msg.epoch, senderDeviceId: msg.senderDeviceId });
    for (const keyId of [devId, ...listHistoryKeyIds()]) {
      const wrapped = dist.encryptedKeys?.[keyId];
      if (!wrapped) continue;
      const privateKey = keyId === devId ? await getPrivateKey(keyId) : await getHistoryKey(keyId);
      if (!privateKey) continue;
      senderKey = await unwrapSenderKey(wrapped, privateKey);
      await storeSenderKey(room._id, msg.senderDeviceId, msg.epoch, senderKey);
      return senderKey;
    }
    return null;
  };

  // Giải mã 1 tin nhắn, tự nhận diện scheme — trả cả key resolved (__key) để tái dùng cho file đính kèm/forward.
  const decryptIncomingMessage = async (msg) => {
    if (!msg.content) return { text: '', key: null };
    // Plaintext legacy fallback — tin nhắn tạo trước khi phòng có E2EE (chỉ áp dụng DM cũ).
    if (msg.scheme !== 'sender-key' && !msg.encryptedKeys) {
      return { text: msg.content, key: null };
    }
    try {
      const key = await resolveMessageKey(msg);
      if (!key) {
        return {
          text: msg.scheme === 'sender-key'
            ? '[Không thể giải mã tin nhắn — Thiết bị này chưa được phân phối Sender Key]'
            : '[Không thể giải mã tin nhắn — Thiết bị này chưa được mã hóa khóa]',
          key: null,
        };
      }
      const text = await decryptContentWithKey(msg, key);
      return { text, key };
    } catch (err) {
      console.error('[E2EE] Decryption error:', err);
      return { text: '[Lỗi Giải Mã Tin Nhắn]', key: null };
    }
  };

  // replyTo là sub-object ciphertext riêng của server, không tự giải mã theo message cha — phải giải mã
  // riêng, chỉ cần cho type 'text' (ảnh/audio/file đã có nhãn tĩnh, không cần đọc content).
  const decryptReplyToPreview = async (replyToMsg) => {
    if (!replyToMsg || replyToMsg.isDeleted || replyToMsg.type !== 'text' || !replyToMsg.content) return replyToMsg;
    const { text } = await decryptIncomingMessage(replyToMsg);
    return { ...replyToMsg, content: text };
  };

  const decryptPollVotes = async (pollVotes) => {
    if (!pollVotes) return {};
    const entries = pollVotes instanceof Map ? [...pollVotes.entries()] : Object.entries(pollVotes);
    const decrypted = await Promise.all(entries.map(async ([voterId, vote]) => {
      const { text } = await decryptIncomingMessage(vote);
      return [voterId, text];
    }));
    return Object.fromEntries(decrypted);
  };

  // Decrypt tin nhắn helper
  const processDecryption = async (rawMessages) => {
    const decrypted = await Promise.all(
      rawMessages.map(async (m) => {
        if (m.isDeleted) return m;
        const { text, key } = await decryptIncomingMessage(m);
        const replyToMsg = await decryptReplyToPreview(m.replyTo);
        const pollVotes = m.type === 'poll' ? await decryptPollVotes(m.pollVotes) : undefined;
        // rawContent giữ ciphertext gốc — ReportModal cần hash đúng bản mã này, không phải plaintext.
        return { ...m, replyTo: replyToMsg, pollVotes, decryptedText: text, content: text, rawContent: m.content, __key: key };
      })
    );
    return decrypted;
  };

  useEffect(() => {
    if (!room) return;

    getRoomMessages(room._id, { limit: 30 })
      .then(async data => {
        const decrypted = await processDecryption(data);
        setMessages(decrypted);
        setHasMore(data.length === 30);
        setTimeout(() => bottomRef.current?.scrollIntoView(), 100);
        // Báo "đã đọc" sau khi giải mã xong — không phải lúc fetch ciphertext (xem rooms.service.js).
        emit('room:read', { roomId: room._id });
      })
      .catch(err => {
        console.error('Lỗi khi tải tin nhắn:', err);
        toast.error('Không thể tải tin nhắn');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  // Tin nhắn tự hủy tự ẩn đúng lúc hết hạn — MongoDB TTL chỉ dọn vật lý phía server, ẩn UI phải tự lo ở client.
  useEffect(() => {
    const timers = [];
    messages.forEach(m => {
      if (!m.expiresAt || scheduledExpiryRef.current.has(m._id)) return;
      scheduledExpiryRef.current.add(m._id);
      const msUntilExpiry = new Date(m.expiresAt).getTime() - Date.now();
      const hide = () => setMessages(prev => prev.filter(x => x._id !== m._id));
      if (msUntilExpiry <= 0) { hide(); return; }
      timers.push(setTimeout(hide, msUntilExpiry));
    });
    return () => timers.forEach(clearTimeout);
  }, [messages]);

  // Lắng nghe các sự kiện WebSocket liên quan tới danh sách tin nhắn (message:*, typing:*)
  useEffect(() => {
    if (!room) return;

    // Nhận tin nhắn mới — chỉ tự cuộn xuống khi chính mình vừa gửi, tránh giật cuộn khi người khác nhắn.
    const offNew = on('message:new', async (msg) => {
      if (msg.room?.toString() === room._id?.toString()) {
        const { text: decryptedText, key } = await decryptIncomingMessage(msg);
        const replyToMsg = await decryptReplyToPreview(msg.replyTo);
        const pollVotes = msg.type === 'poll' ? await decryptPollVotes(msg.pollVotes) : undefined;
        const processedMsg = { ...msg, replyTo: replyToMsg, pollVotes, decryptedText, content: decryptedText, rawContent: msg.content, __key: key };
        setMessages(prev => [...prev, processedMsg]);
        if (msg.sender?._id?.toString() === user._id?.toString()) {
          bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
      }
    });

    const offDeleted = on('message:deleted', ({ messageId }) => {
      setMessages(prev =>
        prev.map(m => m._id === messageId ? { ...m, isDeleted: true } : m)
      );
    });

    const offReacted = on('message:reacted', ({ messageId, reactions }) => {
      setMessages(prev =>
        prev.map(m => m._id === messageId ? { ...m, reactions } : m)
      );
    });

    const offEdited = on('message:edited', async ({ messageId, content, iv, tag, encryptedKeys, scheme, senderDeviceId, epoch, isEdited }) => {
      const { text: decryptedText, key } = await decryptIncomingMessage({ content, iv, tag, encryptedKeys, scheme, senderDeviceId, epoch });
      setMessages(prev =>
        prev.map(m => m._id === messageId
          ? { ...m, content: decryptedText, decryptedText, rawContent: content, iv, tag, encryptedKeys, scheme, senderDeviceId, epoch, isEdited, __key: key }
          : m)
      );
    });

    const offPollVoted = on('poll:voted', async ({ messageId, pollVotes }) => {
      const decryptedVotes = await decryptPollVotes(pollVotes);
      setMessages(prev => prev.map(m => m._id === messageId ? { ...m, pollVotes: decryptedVotes } : m));
    });

    const offRead = on('room:read', ({ roomId, userId: readerId, readAt }) => {
      if (roomId === room._id && readerId !== user._id) setPartnerReadAt(new Date(readAt));
    });

    const offTypingStart = on('typing:start', ({ userId: uid, username, roomId }) => {
      if (roomId === room._id && uid !== user._id) {
        setTyping(prev => prev.includes(username) ? prev : [...prev, username]);
      }
    });
    const offTypingStop = on('typing:stop', ({ roomId }) => {
      if (roomId === room._id) setTyping([]);
    });

    return () => {
      offNew(); offDeleted(); offReacted(); offEdited(); offPollVoted(); offRead();
      offTypingStart(); offTypingStop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, user, on, isConnected]);

  const loadMore = async () => {
    if (messages.length === 0) return;
    const cursor = messages[0].createdAt;
    try {
      const data = await getRoomMessages(room._id, { before: cursor, limit: 30 });
      const decrypted = await processDecryption(data);
      setMessages(prev => [...decrypted, ...prev]);
      setHasMore(data.length === 30);
    } catch (err) {
      console.error('Lỗi khi tải thêm tin nhắn cũ:', err);
      toast.error('Không thể tải thêm tin nhắn');
    }
  };

  const handleReact = useCallback((messageId, emoji) => {
    emit('message:react', { messageId, emoji });
  }, [emit]);

  const handleTyping = useCallback((isTyping) => {
    emit(isTyping ? 'typing:start' : 'typing:stop', { roomId: room?._id });
  }, [emit, room]);

  const handleEdit = useCallback(async (messageId, newContent) => {
    try {
      const payload = await encryptForRoom(newContent);
      emit('message:edit', { messageId, ...payload });
    } catch (err) {
      console.error('[E2EE] Edit error:', err);
      toast.error('Không thể mã hóa nội dung chỉnh sửa tin nhắn.');
    }
  }, [emit, encryptForRoom]);

  const handlePollVote = useCallback(async (messageId, optionIndex) => {
    try {
      const payload = await encryptForRoom(JSON.stringify({ optionIndex }));
      emit('poll:vote', { messageId, ...payload }, (response) => {
        if (!response?.success) toast.error(response?.message || 'Không thể bỏ phiếu');
      });
    } catch (err) {
      console.error('[E2EE] Poll vote error:', err);
      toast.error('Không thể mã hóa phiếu bầu');
    }
  }, [emit, encryptForRoom]);

  return {
    messages, setMessages,
    hasMore, typing, replyTo, setReplyTo,
    processDecryption, loadMore,
    handleReact, handleTyping, handleEdit, handlePollVote,
    partnerReadAt,
  };
}
