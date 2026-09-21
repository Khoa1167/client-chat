/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { toast } from '../components/common/toastStore';
import { debugLog } from '../utils/debugLog';
import { cacheMessages, updateCachedMessage } from '../crypto';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectFailed, setReconnectFailed] = useState(false);
  const { user } = useAuth();
  // Phát lại nội bộ (không qua network) các sự kiện lấy từ mailbox khi reconnect — để các hook
  // như useChatMessages (đang lắng nghe qua useSocket().on) cập nhật UI ngay, không cần F5.
  const mailboxEmitter = useMemo(() => new EventTarget(), []);

  const socket = useMemo(() => {
    // Token nằm trong cookie httpOnly (tự gửi kèm handshake qua withCredentials), không còn
    // cách nào đọc được từ JS — dùng user (đã xác thực qua /me) làm điều kiện khởi tạo thay thế.
    if (!user?._id) return null;
    return io(import.meta.env.VITE_SERVER_URL || undefined, {
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });
  }, [user?._id]);

  useEffect(() => {
    if (!socket) {
      debugLog('⚡ Socket: Không thể khởi tạo do chưa đăng nhập');
      return;
    }

    debugLog('⚡ Socket: Đã khởi tạo thực thể socket, đang kết nối...');

    let timer;

    let mailboxPulling = false;
    let stopped = false;

    const onConnect = () => {
      debugLog('⚡ Socket: Kết nối thành công! ID:', socket.id);
      setIsConnected(true);
      setReconnectFailed(false);
      void pullMailbox();
    };

    const onConnectError = (err) => {
      console.error('⚡ Socket: Lỗi kết nối:', err.message);
      setIsConnected(false);
    };

    const onDisconnect = (reason) => {
      debugLog('⚡ Socket: Mất kết nối:', reason);
      setIsConnected(false);
      mailboxPulling = false;
    };

    // 'reconnect' (socket.io Manager) chỉ bắn sau khi đã mất kết nối, không bắn lần connect đầu.
    const onReconnect = () => {
      debugLog('⚡ Socket: Kết nối lại thành công');
      toast.success('Đã kết nối lại');
    };

    // Hết reconnectionAttempts — socket.io tự ngừng thử, cần connect() thủ công hoặc F5.
    const onReconnectFailed = () => {
      console.error('⚡ Socket: Hết lượt thử kết nối lại');
      setReconnectFailed(true);
    };

    const onMailboxEvent = async ({ id, event, payload }) => {
      try {
        const roomId = (payload?.room?._id || payload?.room || payload?.roomId)?.toString();
        if (event === 'message:new' && roomId && payload?._id) {
          await cacheMessages(user._id, roomId, [payload]);
        } else if (event === 'message:edited' && roomId) {
          await updateCachedMessage(user._id, roomId, payload.messageId, payload);
        } else if (event === 'message:reacted' && roomId) {
          await updateCachedMessage(user._id, roomId, payload.messageId, { reactions: payload.reactions });
        } else if (event === 'poll:voted' && roomId) {
          await updateCachedMessage(user._id, roomId, payload.messageId, { pollVotes: payload.pollVotes });
        } else if (event === 'message:deleted' && roomId) {
          await updateCachedMessage(user._id, roomId, payload.messageId, { isDeleted: true, content: 'Tin nhắn đã bị thu hồi', iv: null, tag: null });
        }
        mailboxEmitter.dispatchEvent(new CustomEvent(event, { detail: payload }));
        if (id) socket.emit('mailbox:ack', { id });
      } catch (err) {
        console.error('[Mailbox] Không thể lưu sự kiện đồng bộ:', err);
      }
    };

    const pullMailbox = async () => {
      if (mailboxPulling) return;
      mailboxPulling = true;
      try {
        let cursor = null;
        do {
          const page = await new Promise(resolve => socket.timeout(15000).emit(
            'mailbox:pull', { cursor, limit: 100 }, (error, response) => resolve(error ? null : response)
          ));
          if (!page?.success) break;
          for (const entry of page.entries || []) await onMailboxEvent(entry);
          cursor = page.nextCursor;
          if (!page.hasMore) break;
        } while (!stopped && cursor);
      } finally {
        mailboxPulling = false;
      }
    };

    socket.on('connect', onConnect);
    socket.on('connect_error', onConnectError);
    socket.on('disconnect', onDisconnect);
    socket.io.on('reconnect', onReconnect);
    socket.io.on('reconnect_failed', onReconnectFailed);
    socket.on('mailbox:event', onMailboxEvent);
    if (socket.connected) void pullMailbox();

    // Đảm bảo socket kết nối lại nếu bị ngắt trong StrictMode cleanup
    if (!socket.connected) {
      socket.connect();
    }

    // Nếu socket đã connected (từ lần trước), set ngay bằng setTimeout để tránh cảnh báo đồng bộ của react
    if (socket.connected) {
      timer = setTimeout(() => {
        setIsConnected(true);
      }, 0);
    }

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      socket.off('connect', onConnect);
      socket.off('connect_error', onConnectError);
      socket.off('disconnect', onDisconnect);
      socket.io.off('reconnect', onReconnect);
      socket.io.off('reconnect_failed', onReconnectFailed);
      socket.off('mailbox:event', onMailboxEvent);
      socket.disconnect();
    };
  }, [socket, user?._id, mailboxEmitter]);

  return (
    <SocketContext.Provider value={{ socket, isConnected, reconnectFailed, mailboxEmitter }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocketContext = () => useContext(SocketContext);
