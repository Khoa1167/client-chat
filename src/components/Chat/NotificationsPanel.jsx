import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { X } from '../icons';
import Button from '../common/Button';
import { useSocket } from '../../hooks/useSocket';
import { getNotifications, markNotificationsRead } from '../../api/notifications.api';
import { toast } from '../common/toastStore';

const TYPE_TEXT = {
  friend_request: (n) => `${displayName(n.fromUser)} đã gửi cho bạn lời mời kết bạn`,
  friend_accepted: (n) => `${displayName(n.fromUser)} đã chấp nhận lời mời kết bạn của bạn`,
  group_added: (n) => `${displayName(n.fromUser)} đã thêm bạn vào nhóm ${n.room?.name || ''}`,
  group_kicked: (n) => `${displayName(n.fromUser)} đã xóa bạn khỏi nhóm ${n.room?.name || ''}`,
};

function displayName(user) {
  return user?.nickname || user?.username || 'Ai đó';
}

// Trung tâm thông báo — chỉ gom sự kiện rời rạc (lời mời/chấp nhận kết bạn, thêm/kick khỏi nhóm),
// KHÔNG gồm tin nhắn chưa đọc (đã có chấm ở Sidebar, xem CLAUDE.md/gốc — tránh trùng nguồn dữ liệu).
//
// PC: panel bật/tắt neo cạnh icon loa, tồn tại song song với Sidebar/ChatWindow (không có backdrop
// che, không chặn thao tác chỗ khác) — đóng bằng bấm ra ngoài (giống dropdown menu tin nhắn) hoặc nút X.
// Mobile: chiếm trọn màn hình như 1 tab riêng (đứng cạnh Đoạn chat/Bạn bè), thanh tab dưới vẫn lộ ra
// để bấm chuyển tab khác — chỉ khác breakpoint qua class md:, không tách logic/component riêng.
export default function NotificationsPanel({ onClose, onGoToChat, onGoToFriends }) {
  const { on } = useSocket();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getNotifications()
      .then(setNotifications)
      .catch(() => toast.error('Không thể tải thông báo'))
      .finally(() => setLoading(false));
    markNotificationsRead().catch(() => {});
  }, []);

  useEffect(() => {
    const off = on('notification:new', (notif) => {
      setNotifications(prev => [notif, ...prev]);
      markNotificationsRead().catch(() => {}); // panel đang mở — coi như đọc ngay
    });
    return off;
  }, [on]);

  // Bấm ra ngoài panel thì đóng — cùng cơ chế với dropdown hành động tin nhắn (MessageItem.jsx).
  useEffect(() => {
    const handleClose = () => onClose();
    document.addEventListener('click', handleClose);
    return () => document.removeEventListener('click', handleClose);
  }, [onClose]);

  const handleClick = (notif) => {
    if (notif.type === 'friend_request' || notif.type === 'friend_accepted') {
      onGoToFriends?.();
    } else {
      onGoToChat?.();
    }
    onClose();
  };

  return (
    <div
      onClick={e => e.stopPropagation()}
      // Mobile: chừa hẳn dải bottom-16 (chiều cao thanh tab) thay vì đè z-index lên — thanh tab vốn
      // position:fixed nên luôn thắng z-order bất kể z-index nếu 2 vùng chồng lên nhau; tránh chồng
      // hẳn là cách chắc chắn duy nhất để vẫn bấm được các tab khác trong lúc panel đang mở.
      className="fixed inset-x-0 top-0 bottom-16 z-20 bg-base-100 flex flex-col p-4
        md:absolute md:inset-auto md:bottom-0 md:left-full md:ml-3 md:z-50 md:w-96
        md:max-h-[70vh] md:rounded-2xl md:border md:border-base-300 md:shadow-2xl"
    >
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <h3 className="font-bold text-lg">Thông báo</h3>
        <Button onClick={onClose} size="xs" circle className="md:hidden">
          <X className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto flex flex-col gap-1 -mx-2 px-2">
        {loading && <p className="text-xs text-center text-base-content/50 py-6">Đang tải...</p>}
        {!loading && notifications.length === 0 && (
          <p className="text-xs text-center text-base-content/50 py-6 italic">Chưa có thông báo nào</p>
        )}
        {notifications.map(n => (
          <div
            key={n._id}
            onClick={() => handleClick(n)}
            className={`flex items-center gap-3 px-2 py-2 rounded-xl cursor-pointer hover:bg-base-200 ${!n.isRead ? 'bg-primary/5' : ''}`}
          >
            <div className="avatar placeholder flex-shrink-0">
              <div className="w-9 rounded-full bg-primary/10 text-primary font-bold text-xs">
                {n.fromUser?.avatar ? (
                  <img src={n.fromUser.avatar} alt="avatar" />
                ) : (
                  <span>{displayName(n.fromUser)[0].toUpperCase()}</span>
                )}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs">{(TYPE_TEXT[n.type] || (() => 'Thông báo mới'))(n)}</p>
              <p className="text-[10px] text-base-content/40 mt-0.5">
                {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: vi })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
