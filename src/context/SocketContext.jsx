/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { toast } from '../components/common/toastStore';
import { debugLog } from '../utils/debugLog';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectFailed, setReconnectFailed] = useState(false);
  const { user } = useAuth();

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

    const onConnect = () => {
      debugLog('⚡ Socket: Kết nối thành công! ID:', socket.id);
      setIsConnected(true);
      setReconnectFailed(false);
    };

    const onConnectError = (err) => {
      console.error('⚡ Socket: Lỗi kết nối:', err.message);
      setIsConnected(false);
    };

    const onDisconnect = (reason) => {
      debugLog('⚡ Socket: Mất kết nối:', reason);
      setIsConnected(false);
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

    socket.on('connect', onConnect);
    socket.on('connect_error', onConnectError);
    socket.on('disconnect', onDisconnect);
    socket.io.on('reconnect', onReconnect);
    socket.io.on('reconnect_failed', onReconnectFailed);

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
      if (timer) clearTimeout(timer);
      socket.off('connect', onConnect);
      socket.off('connect_error', onConnectError);
      socket.off('disconnect', onDisconnect);
      socket.io.off('reconnect', onReconnect);
      socket.io.off('reconnect_failed', onReconnectFailed);
      socket.disconnect();
    };
  }, [socket]);

  return (
    <SocketContext.Provider value={{ socket, isConnected, reconnectFailed }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocketContext = () => useContext(SocketContext);
