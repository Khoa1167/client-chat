import { useState, useEffect } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { MessageCircleIcon } from '@hugeicons/core-free-icons';
import { useSearchParams, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { format } from 'date-fns';
import { toast }  from '../components/common/toastStore';
import Modal      from '../components/common/Modal';
import Button     from '../components/common/Button';
import IconRail   from '../components/Chat/IconRail';
import Sidebar    from '../components/Chat/Sidebar';
import ChatWindow from '../components/Chat/ChatWindow';
import FriendList from '../components/Chat/FriendList';
import OtherUserProfileModal from '../components/Profile/OtherUserProfileModal';
import ProfileModal from '../components/Profile/ProfileModal';
import { previewInvite, joinViaInvite } from '../api/rooms.api';
import { useSocket } from '../hooks/useSocket';
import { useCall } from '../context/CallContext';
import { useGroupCall } from '../context/GroupCallContext';
import { ChevronLeft } from '../components/icons';

export default function ChatPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const [activeRoom, setActiveRoom] = useState(null);
  // Thu/mở Sidebar bằng nút bấm — hover-reveal trước đó không ổn định, chuyển sang toggle đơn giản.
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // 'chat' | 'friends' — độc lập với activeRoom để giữ được phòng đang xem trước đó. Khởi tạo từ
  // location.state.view khi điều hướng tới từ trang khác (vd navigate('/', {state:{view:'friends'}})).
  const [view, setView] = useState(location.state?.view || 'chat');
  const [viewingUserId, setViewingUserId] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  // Xem trước phòng khi mở link/QR mời (?invite=code) — null | { inviteCode, name, memberCount, isMember }
  const [invitePreview, setInvitePreview] = useState(null);
  const [inviteJoining, setInviteJoining] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const { on } = useSocket();
  const { startCall } = useCall();
  const { joinGroupCall } = useGroupCall();

  useEffect(() => {
    const offRoomRemoved = on('room:removed', ({ roomId, reason }) => {
      setActiveRoom(prev => {
        if (prev?._id === roomId) {
          if (reason === 'kicked') toast.error('Bạn đã bị xóa khỏi nhóm');
          else if (reason === 'deleted') toast.error('Nhóm đã bị giải tán');
          setView('friends');
          return null;
        }
        return prev;
      });
    });
    return offRoomRemoved;
  }, [on]);

  // Chọn phòng để chat — đẩy thêm 1 entry lịch sử "đang mở phòng X", để nút back/vuốt lùi mobile
  // đóng phòng về danh sách thay vì pop nhầm sang route trước đó (mở phòng trước giờ chỉ đổi state).
  const handleSelectRoom = (room) => {
    setActiveRoom(room);
    setView('chat');
    navigate('.', { state: { roomId: room._id } });
  };

  // Back/vuốt lùi (POP) làm location.state.roomId biến mất — đồng bộ lại activeRoom theo lịch sử.
  // Chỉ xử lý POP thật, không đụng setSearchParams (REPLACE) của luồng invite/add-friend bên dưới.
  useEffect(() => {
    if (navigationType === 'POP' && !location.state?.roomId) {
      // Đồng bộ state với lịch sử điều hướng (nguồn ngoài) — xem useAvailabilityCheck.js.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveRoom(null);
    }
  }, [location, navigationType]);

  // Mở link/QR mời (?invite=code) — xem trước thông tin phòng trước khi quyết định tham gia
  useEffect(() => {
    const code = searchParams.get('invite');
    if (!code) return;
    setSearchParams(prev => { prev.delete('invite'); return prev; }, { replace: true });

    previewInvite(code)
      .then((data) => setInvitePreview({ ...data, inviteCode: code }))
      .catch(err => toast.error(err.response?.data?.message || 'Link mời không hợp lệ'));
  }, [searchParams, setSearchParams]);

  // Mở link/QR kết bạn (?add-friend=userId) — tận dụng OtherUserProfileModal có sẵn, không cần preview riêng.
  useEffect(() => {
    const targetUserId = searchParams.get('add-friend');
    if (!targetUserId) return;
    setSearchParams(prev => { prev.delete('add-friend'); return prev; }, { replace: true });
    // Đồng bộ state với query param từ URL (nguồn ngoài) — xem useAvailabilityCheck.js.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setViewingUserId(targetUserId);
  }, [searchParams, setSearchParams]);

  const handleJoinViaInvite = async () => {
    if (!invitePreview) return;
    setInviteJoining(true);
    try {
      const data = await joinViaInvite(invitePreview.inviteCode);
      if (data.status === 'pending') {
        toast.success('Đã gửi yêu cầu tham gia, chờ quản trị viên duyệt');
      } else {
        handleSelectRoom(data);
      }
      setInvitePreview(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không thể tham gia nhóm');
    } finally {
      setInviteJoining(false);
    }
  };

  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden bg-base-100 text-base-content font-sans select-none relative">
      {/* Cột 0: Thanh icon điều hướng toàn app */}
      <IconRail
        view={view}
        onSelectChat={() => setView('chat')}
        onSelectFriends={() => setView('friends')}
        onOpenProfile={() => setShowProfile(true)}
      />

      {/* Sidebar: 2 lớp div — lớp ngoài co giãn width (giống drawer daisyUI), lớp trong giữ width
          thật + trượt bằng translate-x đồng bộ, để nội dung trượt hẳn sang trái thay vì bị cắt cụt. */}
      <div className={`relative flex-1 md:flex-none ${view === 'chat' && !activeRoom ? 'flex' : 'hidden md:flex'}`}>
        <div
          className={`w-full overflow-hidden transition-all duration-300 ${
            sidebarOpen ? 'md:w-[280px] lg:w-[320px] xl:w-[360px]' : 'md:w-0'
          }`}
        >
          <div
            className={`h-full w-full md:w-[280px] lg:w-[320px] xl:w-[360px] flex flex-col bg-base-100 border-r border-base-300 transition-transform duration-300 pb-16 md:pb-0 ${
              sidebarOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            <Sidebar activeRoom={activeRoom} onSelectRoom={handleSelectRoom} />
          </div>
        </div>
        <button
          onClick={() => setSidebarOpen(o => !o)}
          className="hidden md:flex btn btn-circle btn-xs bg-base-200 border border-base-300 shadow absolute top-1/2 -translate-y-1/2 -right-3 z-20"
          title={sidebarOpen ? 'Thu gọn danh sách chat' : 'Mở danh sách chat'}
        >
          <ChevronLeft className={`w-3.5 h-3.5 transition-transform duration-300 ${sidebarOpen ? '' : 'rotate-180'}`} />
        </button>
      </div>

      {/* Vùng nội dung chính — mobile ẩn khi Sidebar full-screen, pb-16 chừa chỗ bottom tab bar. */}
      <div className={`flex-1 flex-col min-w-0 bg-base-100 pb-16 md:pb-0 ${view === 'chat' && !activeRoom ? 'hidden md:flex' : 'flex'}`}>
        {view === 'chat' ? (
          <ChatWindow
            key={activeRoom?._id || 'empty'}
            room={activeRoom}
            onCloseChat={() => navigate(-1)}
            onBackToFriends={() => { navigate(-1); setView('friends'); }}
            onInitiateCall={startCall}
            onInitiateGroupCall={joinGroupCall}
            onViewProfile={(userId) => setViewingUserId(userId)}
          />
        ) : (
          <FriendList
            onSelectDM={handleSelectRoom}
            onViewProfile={(userId) => setViewingUserId(userId)}
          />
        )}
      </div>

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}

      {invitePreview && (
        <Modal onClose={() => setInvitePreview(null)} boxClassName="max-w-sm bg-base-100 border border-base-300 shadow-2xl">
          <h3 className="text-base font-bold mb-3">Bạn được mời vào nhóm</h3>

          <div className="flex flex-col items-center gap-2 mb-4">
            {invitePreview.avatar ? (
              <div className="avatar">
                <div className="w-20 rounded-full ring-2 ring-primary/30">
                  <img src={invitePreview.avatar} alt="avatar phòng" />
                </div>
              </div>
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-primary to-secondary text-primary-content flex items-center justify-center ring-2 ring-primary/30">
                <HugeiconsIcon icon={MessageCircleIcon} size={32} strokeWidth={1.8} />
              </div>
            )}
            <p className="text-lg font-bold text-primary text-center">{invitePreview.name || 'Nhóm chat'}</p>
            <p className="text-xs text-base-content/60 text-center">
              {invitePreview.memberCount} thành viên
              {invitePreview.createdAt && ` · Tạo ngày ${format(new Date(invitePreview.createdAt), 'dd/MM/yyyy')}`}
            </p>
          </div>

          {/* Danh sách thành viên chỉ server trả về khi phòng công khai (xem previewInvite trong
              rooms.service.js) — phòng private chỉ có memberCount ở trên, không lộ ai đang ở trong. */}
          {invitePreview.members && (
            <div className="flex flex-col gap-1 max-h-40 overflow-y-auto mb-4 -mx-1 px-1">
              {invitePreview.members.map(m => (
                <button
                  key={m._id}
                  type="button"
                  onClick={() => setViewingUserId(m._id)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-base-200 text-left"
                >
                  <div className="avatar placeholder flex-shrink-0">
                    <div className="w-7 rounded-full bg-primary/10 text-primary font-bold text-xs">
                      {m.avatar ? (
                        <img src={m.avatar} alt="avatar" />
                      ) : (
                        <span>{(m.nickname || m.username || '?')[0].toUpperCase()}</span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs font-semibold truncate">{m.nickname || m.username}</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button onClick={() => setInvitePreview(null)} size="sm" pill className="bg-base-200">
              Hủy
            </Button>
            <Button onClick={handleJoinViaInvite} disabled={inviteJoining} variant="primary" size="sm" pill>
              {inviteJoining ? 'Đang mở...' : (invitePreview.isMember ? 'Mở đoạn chat' : 'Tham gia')}
            </Button>
          </div>
        </Modal>
      )}

      {viewingUserId && (
        <OtherUserProfileModal
          userId={viewingUserId}
          onClose={() => setViewingUserId(null)}
          onSelectRoom={handleSelectRoom}
          onInitiateCall={startCall}
        />
      )}
    </div>
  );
}
