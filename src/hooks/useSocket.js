import { useCallback, useEffect, useRef } from 'react';
import { useSocketContext } from '../context/SocketContext';
import { debugLog } from '../utils/debugLog';

export const useSocket = () => {
  const { socket, isConnected, reconnectFailed } = useSocketContext() || {};
  const pendingQueue = useRef([]);

  useEffect(() => {
    if (isConnected && socket && pendingQueue.current.length > 0) {
      debugLog(`⚡ Socket reconnected — flushing ${pendingQueue.current.length} queued event(s)`);
      pendingQueue.current.forEach(({ event, data }) => {
        socket.emit(event, data);
      });
      pendingQueue.current = [];
    }
  }, [isConnected, socket]);

  // callback (tùy chọn): ack socket.io cho action cần biết kết quả ngay (vd thu hồi tin nhắn) —
  // có callback thì KHÔNG queue khi mất kết nối, báo lỗi ngay thay vì để UI treo chờ.
  const emit = useCallback((event, data, callback) => {
    if (!socket) {
      debugLog(`⚠️ Socket chưa khởi tạo, không thể emit: ${event}`);
      if (callback) callback({ success: false, message: 'Mất kết nối, vui lòng thử lại' });
      return;
    }
    if (!socket.connected) {
      if (callback) {
        debugLog(`⚠️ Socket chưa kết nối, không thể emit có ack: ${event}`);
        callback({ success: false, message: 'Mất kết nối, vui lòng thử lại' });
        return;
      }
      // Queue lại để gửi khi kết nối xong (chỉ với các event quan trọng)
      debugLog(`⚠️ Socket chưa kết nối, queued: ${event}`);
      pendingQueue.current.push({ event, data });
      return;
    }
    if (callback) {
      socket.emit(event, data, callback);
    } else {
      socket.emit(event, data);
    }
  }, [socket]);

  const on = useCallback((event, handler) => {
    if (!socket) return () => {};
    socket.on(event, handler);
    return () => {
      socket.off(event, handler);
    };
  }, [socket]);

  return { emit, on, isConnected: !!isConnected, reconnectFailed: !!reconnectFailed, socketRef: { current: socket } };
};