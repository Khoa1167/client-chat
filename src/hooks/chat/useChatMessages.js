import { useState, useEffect, useRef, useCallback } from 'react';
import {
  cacheMessages, getCachedMessagesPage, updateCachedMessage, deleteCachedMessage,
} from '../../crypto';
import {
  decryptIncomingMessage as decryptIncomingMessageFor,
  decryptReplyToPreview as decryptReplyToPreviewFor,
  decryptPollVotes as decryptPollVotesFor,
  processDecryption as processDecryptionFor,
} from '../../crypto/messageDecryption';
import { toast } from '../../components/common/toastStore';

const mergeMessages = (...groups) => [...new Map(groups.flat().map(message => [message._id, message])).values()]
  .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

// Chỉ cho thu hồi tin nhắn trong vòng 24h — khớp RECALL_WINDOW_MS phía server
// (server/src/socket/handlers/message.handler.js), chỉ dùng để không hiện nút Edit quá hạn ở UI.

// Quản lý danh sách tin nhắn: tải/phân trang, giải mã E2EE, socket event message:*/typing:*, react/edit.
export default function useChatMessages(room, user, { emit, on, isConnected }, { bottomRef, containerRef, encryptForRoom }) {
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [typing, setTyping] = useState([]);
  const [replyTo, setReplyTo] = useState(null);
  const localCursorRef = useRef(null);
  const loadingOlderRef = useRef(false);
  // Mốc đối phương đọc gần nhất (chỉ DM) — khởi tạo từ room (đã tính sẵn server-side), cập nhật live qua 'room:read'.
  const [partnerReadAt, setPartnerReadAt] = useState(room?.partnerReadAt ? new Date(room.partnerReadAt) : null);
  // Tin nhắn tự hủy — id đã hẹn giờ ẩn rồi, tránh đặt setTimeout trùng mỗi lần messages đổi
  const scheduledExpiryRef = useRef(new Set());
  const cache = (items) => cacheMessages(user._id, room._id, items).catch(() => {});
  const patchCache = (messageId, patch) => updateCachedMessage(user._id, room._id, messageId, patch).catch(() => {});

  // Wrapper gắn roomId hiện tại — logic giải mã thuần túy sống ở crypto/messageDecryption.js (test được độc lập).
  const decryptIncomingMessage = (msg) => decryptIncomingMessageFor(room._id, msg);
  const decryptReplyToPreview = (replyToMsg) => decryptReplyToPreviewFor(room._id, replyToMsg);
  const decryptPollVotes = (pollVotes) => decryptPollVotesFor(room._id, pollVotes);
  const processDecryption = (rawMessages) => processDecryptionFor(room._id, rawMessages);

  useEffect(() => {
    if (!room) return;

    let active = true;
    localCursorRef.current = null;
    getCachedMessagesPage(user._id, room._id, null, 50)
      .then(async page => {
        const decrypted = await processDecryption(page.items);
        if (!active) return;
        localCursorRef.current = page.nextCursor;
        setMessages(decrypted);
        setHasMore(page.hasMore);
        setTimeout(() => bottomRef.current?.scrollIntoView(), 100);
        // Báo "đã đọc" sau khi giải mã xong — không phải lúc fetch ciphertext (xem rooms.service.js).
        emit('room:read', { roomId: room._id });
      })
      .catch(err => {
        console.error('Lỗi khi tải tin nhắn:', err);
        if (active) toast.error('Không thể tải lịch sử tin nhắn trên thiết bị');
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  // Tin nhắn tự hủy tự ẩn đúng lúc hết hạn — MongoDB TTL chỉ dọn vật lý phía server, ẩn UI phải tự lo ở client.
  useEffect(() => {
    const timers = [];
    messages.forEach(m => {
      if (!m.expiresAt || scheduledExpiryRef.current.has(m._id)) return;
      scheduledExpiryRef.current.add(m._id);
      const msUntilExpiry = new Date(m.expiresAt).getTime() - Date.now();
      const hide = () => {
        setMessages(prev => prev.filter(x => x._id !== m._id));
        deleteCachedMessage(user._id, room._id, m._id).catch(() => {});
      };
      if (msUntilExpiry <= 0) { hide(); return; }
      timers.push(setTimeout(hide, msUntilExpiry));
    });
    return () => timers.forEach(clearTimeout);
  }, [messages, room, user]);

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
        setMessages(prev => mergeMessages(prev, [processedMsg]));
        cache([processedMsg]);
        if (msg.sender?._id?.toString() === user._id?.toString()) {
          bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
      }
    });

    const offDeleted = on('message:deleted', ({ messageId }) => {
      setMessages(prev =>
        prev.map(m => m._id === messageId ? { ...m, isDeleted: true } : m)
      );
      patchCache(messageId, { isDeleted: true, content: 'Tin nhắn đã bị thu hồi', decryptedText: 'Tin nhắn đã bị thu hồi', rawContent: null });
    });

    const offReacted = on('message:reacted', ({ messageId, reactions }) => {
      setMessages(prev =>
        prev.map(m => m._id === messageId ? { ...m, reactions } : m)
      );
      patchCache(messageId, { reactions });
    });

    const offEdited = on('message:edited', async ({ messageId, content, iv, tag, encryptedKeys, scheme, senderDeviceId, epoch, isEdited }) => {
      const { text: decryptedText, key } = await decryptIncomingMessage({ content, iv, tag, encryptedKeys, scheme, senderDeviceId, epoch });
      patchCache(messageId, { content: decryptedText, decryptedText, rawContent: content, iv, tag, encryptedKeys, scheme, senderDeviceId, epoch, isEdited });
      setMessages(prev =>
        prev.map(m => m._id === messageId
          ? { ...m, content: decryptedText, decryptedText, rawContent: content, iv, tag, encryptedKeys, scheme, senderDeviceId, epoch, isEdited, __key: key }
          : m)
      );
    });

    const offPollVoted = on('poll:voted', async ({ messageId, pollVotes }) => {
      const decryptedVotes = await decryptPollVotes(pollVotes);
      setMessages(prev => prev.map(m => m._id === messageId ? { ...m, pollVotes: decryptedVotes } : m));
      patchCache(messageId, { pollVotes: decryptedVotes });
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
    const cursor = localCursorRef.current;
    if (!cursor || loadingOlderRef.current) return;
    loadingOlderRef.current = true;
    const scroller = containerRef.current;
    const previousHeight = scroller?.scrollHeight;
    try {
      const page = await getCachedMessagesPage(user._id, room._id, cursor, 50);
      const decrypted = await processDecryption(page.items);
      localCursorRef.current = page.nextCursor;
      setMessages(prev => mergeMessages(prev, decrypted));
      setHasMore(page.hasMore);
      if (scroller && previousHeight !== undefined) {
        requestAnimationFrame(() => {
          scroller.scrollTop += scroller.scrollHeight - previousHeight;
        });
      }
    } catch (err) {
      console.error('Lỗi khi tải thêm tin nhắn cũ:', err);
      toast.error('Không thể tải thêm tin nhắn');
    } finally {
      loadingOlderRef.current = false;
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
