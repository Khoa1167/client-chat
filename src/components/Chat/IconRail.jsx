import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MessageCircle, Users, KeyRound, Settings, LogOut, ShieldAlert, Megaphone } from '../icons';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../hooks/useSocket';
import { getNotifications } from '../../api/notifications.api';
import ConfirmModal from '../common/ConfirmModal';
import Button from '../common/Button';
import NotificationsPanel from './NotificationsPanel';

const NavIcon = ({ active, onClick, title, children }) => (
  <Button active={active} onClick={onClick} title={title} className="btn-circle btn-md lg:btn-lg">
    {children}
  </Button>
);

export default function IconRail({ view, onSelectChat, onSelectFriends, onOpenProfile, onOpenKeyBackup }) {
  const { user, logout } = useAuth();
  const { on } = useSocket();
  const navigate = useNavigate();
  const location = useLocation();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [hasUnreadNotif, setHasUnreadNotif] = useState(false);

  useEffect(() => {
    getNotifications().then(list => setHasUnreadNotif(list.some(n => !n.isRead))).catch(() => {});
  }, []);

  useEffect(() => {
    const off = on('notification:new', () => setHasUnreadNotif(true));
    return off;
  }, [on]);

  return (
    <div className="fixed bottom-0 inset-x-0 z-30 flex-row justify-around py-2 gap-1 bg-base-200 border-t border-base-300 md:static md:z-auto md:w-16 lg:w-20 md:flex-shrink-0 md:flex-col md:justify-start md:items-center md:py-5 md:gap-3 md:border-t-0 md:border-r flex">
      <div
        className="avatar cursor-pointer hover:opacity-90 transition-opacity md:mb-2"
        onClick={onOpenProfile}
        title="Cài đặt cá nhân"
      >
        <div className="w-11 rounded-full ring-2 ring-primary/40">
          {user.avatar ? (
            <img src={user.avatar} alt="avatar" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-primary text-primary-content font-bold">
              {(user.nickname || user.username)[0].toUpperCase()}
            </div>
          )}
        </div>
      </div>

      <NavIcon active={view === 'chat'} onClick={onSelectChat} title="Đoạn chat">
        <MessageCircle className="w-5 h-5" />
      </NavIcon>
      <NavIcon active={view === 'friends'} onClick={onSelectFriends} title="Bạn bè">
        <Users className="w-5 h-5" />
      </NavIcon>
      <NavIcon onClick={onOpenKeyBackup} title="Sao lưu & Khôi phục Khóa E2EE">
        <KeyRound className="w-5 h-5" />
      </NavIcon>
      <div className="relative">
        <NavIcon
          active={showNotifications}
          onClick={(e) => {
            e.stopPropagation(); // tránh listener "bấm ra ngoài" của panel đóng ngay chính click này
            setShowNotifications(o => !o);
            setHasUnreadNotif(false);
          }}
          title="Thông báo"
        >
          <Megaphone className="w-5 h-5" />
        </NavIcon>
        {hasUnreadNotif && (
          <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-primary ring-2 ring-base-200" />
        )}
        {showNotifications && (
          <NotificationsPanel
            onClose={() => setShowNotifications(false)}
            onGoToChat={onSelectChat}
            onGoToFriends={onSelectFriends}
          />
        )}
      </div>
      <NavIcon active={location.pathname === '/settings'} onClick={() => navigate('/settings')} title="Cài đặt">
        <Settings className="w-5 h-5" />
      </NavIcon>
      {user.role === 'admin' && (
        <NavIcon active={location.pathname === '/admin'} onClick={() => navigate('/admin')} title="Trang quản trị">
          <ShieldAlert className="w-5 h-5" />
        </NavIcon>
      )}

      <div className="hidden md:block md:flex-1" />

      <Button
        variant="ghost-error"
        onClick={() => setShowLogoutConfirm(true)}
        className="btn-circle btn-lg"
        title="Đăng xuất"
      >
        <LogOut className="w-5 h-5" />
      </Button>

      {showLogoutConfirm && (
        <ConfirmModal
          title="Đăng xuất khỏi tài khoản?"
          description="Bạn sẽ cần đăng nhập lại để tiếp tục sử dụng."
          confirmLabel="Đăng xuất"
          onConfirm={logout}
          onCancel={() => setShowLogoutConfirm(false)}
        />
      )}
    </div>
  );
}
