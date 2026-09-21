import { useState, useEffect } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { AlertCircleIcon, ArrowRight01Icon, Cancel01Icon, UserStatusIcon } from '@hugeicons/core-free-icons';
import { ShieldCheck, ChevronRight, QrCode } from '../icons';
import { toast } from '../common/toastStore';
import Modal from '../common/Modal';
import ConfirmModal from '../common/ConfirmModal';
import Button from '../common/Button';
import BlockUserButton from '../common/BlockUserButton';
import Spinner from '../common/Spinner';
import ShareProfileModal from './ShareProfileModal';
import {
  getUserProfile,
  setFriendAlias,
  sendFriendRequest,
  cancelFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  unfriend,
  getDmRoom,
} from '../../api/friends.api';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../hooks/useSocket';
import SafetyNumberModal from '../Chat/SafetyNumberModal';
import { formatDistanceToNow, format } from 'date-fns';
import { vi } from 'date-fns/locale';

export default function OtherUserProfileModal({ userId, onClose, onSelectRoom, onInitiateCall }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [showSafetyNumber, setShowSafetyNumber] = useState(false);
  const [showShareProfile, setShowShareProfile] = useState(false);
  const [showUnfriendConfirm, setShowUnfriendConfirm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const { on } = useSocket();

  const [alias, setAlias] = useState('');
  const [isEditingAlias, setIsEditingAlias] = useState(false);
  const [aliasLoading, setAliasLoading] = useState(false);

  const handleSaveAlias = async () => {
    setAliasLoading(true);
    try {
      const data = await setFriendAlias(userId, alias);
      setProfile(prev => ({ ...prev, customAlias: data.customAlias }));
      setIsEditingAlias(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không thể lưu biệt danh');
    } finally {
      setAliasLoading(false);
    }
  };

  useEffect(() => {
    if (!userId) return;
    let active = true;
    getUserProfile(userId)
      .then(data => {
        if (!active) return;
        setProfile(data);
        setAlias(data.customAlias || '');
        setError('');
      })
      .catch(err => {
        if (active) setError(err.response?.data?.message || 'Không thể tải thông tin người dùng');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    if (!profile?.user?._id) return;

    const updateStatus = (socketUserId, isOnline) => {
      if (socketUserId?.toString() === profile.user._id?.toString()) {
        setProfile(prev => prev ? {
          ...prev,
          user: {
            ...prev.user,
            isOnline,
            lastSeen: new Date(),
          }
        } : null);
      }
    };

    const offOnline = on('user:online', ({ userId }) => updateStatus(userId, true));
    const offOffline = on('user:offline', ({ userId }) => updateStatus(userId, false));

    return () => {
      offOnline();
      offOffline();
    };
  }, [profile?.user?._id, on]);

  useEffect(() => {
    const syncBlock = (event) => {
      if (event.detail.userId === userId) {
        setProfile(prev => prev && ({ ...prev, blockedByMe: event.detail.blocked,
          friendshipStatus: event.detail.blocked ? 'none' : prev.friendshipStatus,
          friendshipId: event.detail.blocked ? null : prev.friendshipId }));
      }
    };
    window.addEventListener('user:block_changed', syncBlock);
    return () => window.removeEventListener('user:block_changed', syncBlock);
  }, [userId]);

  // ── Xử lý các nút hành động ──

  const handleSendRequest = async () => {
    setActionLoading(true);
    try {
      await sendFriendRequest(userId);
      setProfile(prev => ({ ...prev, friendshipStatus: 'pending_sent' }));
      toast.success('Đã gửi lời mời kết bạn');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gửi lời mời thất bại');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelRequest = async () => {
    setActionLoading(true);
    try {
      await cancelFriendRequest(userId);
      setProfile(prev => ({ ...prev, friendshipStatus: 'none', friendshipId: null }));
      toast.success('Đã hủy lời mời kết bạn');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Hủy lời mời thất bại');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAcceptRequest = async () => {
    if (!profile.friendshipId) return;
    setActionLoading(true);
    try {
      await acceptFriendRequest(profile.friendshipId);
      setProfile(prev => ({ ...prev, friendshipStatus: 'accepted' }));
      toast.success('Kết bạn thành công');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Chấp nhận thất bại');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectRequest = async () => {
    if (!profile.friendshipId) return;
    setActionLoading(true);
    try {
      await rejectFriendRequest(profile.friendshipId);
      setProfile(prev => ({ ...prev, friendshipStatus: 'none', friendshipId: null }));
      toast.success('Đã từ chối lời mời kết bạn');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Từ chối thất bại');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnfriend = async () => {
    setShowUnfriendConfirm(false);
    setActionLoading(true);
    try {
      await unfriend(userId);
      setProfile(prev => ({ ...prev, friendshipStatus: 'none', friendshipId: null }));
      toast.success('Đã hủy kết bạn');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Hủy kết bạn thất bại');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenDM = async () => {
    try {
      // Server tự tạo phòng DM nếu đã là bạn nhưng chưa từng có (getOrCreateDmRoom) — không cần
      // tự phân biệt trường hợp ở client, chỉ còn lỗi thật sự khi chưa kết bạn.
      const dmRoom = await getDmRoom(userId);
      if (dmRoom && onSelectRoom) {
        onSelectRoom(dmRoom);
        onClose();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không thể mở đoạn chat');
    }
  };

  if (!userId) return null;

  // Phân biệt "chưa cập nhật" (trống thật) với "bị ẩn vì chưa là bạn" — cùng hiện rỗng ở server
  // nhưng lý do khác nhau, không nên hiện chung 1 message gây hiểu nhầm là người ta chưa điền.
  const isFriendOrSelf = profile?.friendshipStatus === 'accepted' || profile?.friendshipStatus === 'self';
  const privateFieldFallback = isFriendOrSelf ? 'Chưa cập nhật' : 'Chỉ bạn bè mới xem được';

  return (
    <Modal onClose={onClose} boxClassName="p-0 max-w-md bg-base-100 border border-base-300 shadow-2xl">
        <div className="p-4 border-b border-base-300 flex items-center justify-between bg-base-200/50">
          <h2 className="text-base font-bold">Trang cá nhân</h2>
          <Button size="sm" pill className="bg-base-200 gap-1" onClick={onClose}>
            <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.8} />Đóng
          </Button>
        </div>

        <div className="overflow-y-auto max-h-[80vh] p-6 hide-scrollbar flex flex-col gap-6 bg-base-100">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-base-content/40">
              <Spinner size="md" />
              <span className="text-sm font-medium">Đang tải thông tin...</span>
            </div>
          ) : error ? (
            <div className="py-8 text-center text-error text-sm font-semibold flex items-center justify-center gap-1">
              <HugeiconsIcon icon={AlertCircleIcon} size={16} strokeWidth={1.8} />{error}
            </div>
          ) : profile ? (
            <>
              {/* Profile Hero Section */}
              <div className="flex flex-col items-center text-center gap-2">
                <div className="relative w-full h-32 rounded-xl bg-gradient-to-r from-primary to-secondary overflow-hidden shadow-xs">
                  {profile.user.cover ? (
                    <img src={profile.user.cover} alt="cover" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-r from-primary to-secondary opacity-90 flex items-center justify-center text-primary-content/30 text-xs font-semibold">
                      Chưa có ảnh bìa
                    </div>
                  )}
                </div>

                <div className={`avatar -mt-12 ${profile.user.isOnline === null ? '' : profile.user.isOnline ? 'avatar-online' : 'avatar-offline'}`}>
                  <div className="w-24 rounded-full bg-primary text-primary-content font-bold text-3xl shadow-lg ring-4 ring-base-100">
                    {profile.user.avatar ? (
                      <img src={profile.user.avatar} alt="avatar" />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center">{profile.user.nickname[0].toUpperCase()}</span>
                    )}
                  </div>
                </div>

                <div className="mt-1 flex flex-col items-center">
                  {isEditingAlias ? (
                    <div className="flex items-center gap-1.5 mt-1">
                      <input
                        type="text"
                        className="input input-bordered input-sm font-semibold"
                        placeholder="Đặt biệt danh..."
                        value={alias}
                        onChange={e => setAlias(e.target.value)}
                        autoFocus
                      />
                      <Button
                        onClick={handleSaveAlias}
                        disabled={aliasLoading}
                        variant="primary" size="sm"
                      >
                        {aliasLoading ? 'Lưu...' : 'Lưu'}
                      </Button>
                      <Button
                        onClick={() => { setIsEditingAlias(false); setAlias(profile.customAlias || ''); }}
                        size="sm" className="bg-base-200"
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.8} />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-xl font-bold tracking-tight">
                        {profile.customAlias || profile.user.nickname}
                      </h3>
                      {profile.friendshipStatus === 'accepted' && (
                        <Button
                          onClick={() => setIsEditingAlias(true)}
                          size="xs" circle className="!text-base-content/40 hover:!text-primary"
                          title="Đặt biệt danh riêng cho bạn bè"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </Button>
                      )}
                    </div>
                  )}

                  {profile.customAlias && (
                    <p className="text-xs text-base-content/50 font-medium mt-0.5">
                      Tên thật: <span className="font-semibold text-base-content/70">{profile.user.nickname}</span>
                    </p>
                  )}

                  {profile.user.bio && (
                    <p className="text-xs italic text-base-content/70 bg-base-200/80 px-3.5 py-1.5 rounded-xl border border-base-300 max-w-xs mt-2 leading-relaxed">
                      "{profile.user.bio}"
                    </p>
                  )}

                  <p className="text-xs font-semibold mt-1.5">
                    {profile.user.isOnline === null ? (
                      // null khác false — chủ tài khoản đã ẩn trạng thái hoạt động (privacySettings),
                      // không phải đang thật sự offline.
                      <span className="text-base-content/40 italic">{privateFieldFallback}</span>
                    ) : profile.user.isOnline ? (
                      <span className="text-success flex items-center justify-center gap-1">
                        <HugeiconsIcon icon={UserStatusIcon} size={14} strokeWidth={1.8} />Đang hoạt động
                      </span>
                    ) : (
                      <span className="text-base-content/40">
                        {profile.user.lastSeen
                          ? `Hoạt động ${formatDistanceToNow(new Date(profile.user.lastSeen), { addSuffix: true, locale: vi })}`
                          : 'Ngoại tuyến'}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Action Buttons Bar */}
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2 border-t border-base-300">
                {profile.friendshipStatus === 'self' && (
                  <div className="text-xs text-base-content/40 bg-base-200 px-4 py-2 rounded-xl font-medium w-full text-center">
                    Đây là trang cá nhân của bạn
                  </div>
                )}

                {!profile.blockedByMe && profile.friendshipStatus === 'accepted' && (
                  <>
                    <Button
                      onClick={handleOpenDM}
                      variant="primary" size="sm" className="flex-1 gap-1.5"
                    >
                      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                      </svg>
                      <span>Nhắn tin</span>
                    </Button>
                    {onInitiateCall && (
                      <>
                        <button
                          onClick={() => { onInitiateCall(profile.user, 'audio'); onClose(); }}
                          className="btn btn-sm bg-primary/10 hover:bg-primary/20 text-primary border-primary/20"
                          title="Gọi thoại"
                        >
                          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M15.05 5A5 5 0 0 1 19 8.95M15.05 1A9 9 0 0 1 23 8.94m-1 7.98v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                          </svg>
                        </button>
                        <Button
                          onClick={() => { onInitiateCall(profile.user, 'video'); onClose(); }}
                          variant="success" size="sm"
                          title="Gọi video"
                        >
                          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </Button>
                      </>
                    )}
                    <Button
                      onClick={() => setShowUnfriendConfirm(true)}
                      disabled={actionLoading}
                      variant="soft-error" size="sm" className="gap-1.5"
                      title="Hủy kết bạn"
                    >
                      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="8.5" cy="7" r="4" />
                        <line x1="18" y1="8" x2="23" y2="13" />
                        <line x1="23" y1="8" x2="18" y2="13" />
                      </svg>
                      <span>Hủy bạn</span>
                    </Button>
                  </>
                )}

                {!profile.blockedByMe && profile.friendshipStatus === 'none' && (
                  <>
                    <Button
                      onClick={handleSendRequest}
                      disabled={actionLoading}
                      variant="primary" size="sm" className="flex-1 gap-1.5"
                    >
                      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="8.5" cy="7" r="4" />
                        <line x1="20" y1="8" x2="20" y2="14" />
                        <line x1="17" y1="11" x2="23" y2="11" />
                      </svg>
                      <span>{actionLoading ? 'Đang gửi...' : 'Kết bạn'}</span>
                    </Button>
                    <Button
                      onClick={handleOpenDM}
                      size="sm" className="bg-base-200 gap-1.5"
                    >
                      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                      </svg>
                      <span>Nhắn tin</span>
                    </Button>
                  </>
                )}

                {!profile.blockedByMe && profile.friendshipStatus === 'pending_sent' && (
                  <button
                    onClick={handleCancelRequest}
                    disabled={actionLoading}
                    className="btn btn-sm flex-1 bg-warning/10 hover:bg-warning/20 text-warning border-warning/30 gap-1.5"
                  >
                    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span>{actionLoading ? 'Đang hủy...' : 'Đã gửi lời mời (Bấm để hủy)'}</span>
                  </button>
                )}

                {!profile.blockedByMe && profile.friendshipStatus === 'pending_received' && (
                  <>
                    <Button
                      onClick={handleAcceptRequest}
                      disabled={actionLoading}
                      variant="success" size="sm" className="flex-1 gap-1.5"
                    >
                      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Chấp nhận lời mời</span>
                    </Button>
                    <Button
                      onClick={handleRejectRequest}
                      disabled={actionLoading}
                      variant="soft-error" size="sm"
                    >
                      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                      <span>Từ chối</span>
                    </Button>
                  </>
                )}
              </div>
              {profile.friendshipStatus !== 'self' && (
                <BlockUserButton userId={userId} displayName={profile.user.nickname}
                  blocked={profile.blockedByMe} className="w-full" />
              )}

              <div className="bg-base-200/80 border border-base-300 rounded-xl p-4 flex flex-col gap-3">
                <h4 className="text-xs font-bold text-base-content/40 uppercase tracking-wider">Thông tin cá nhân</h4>

                {profile.friendshipStatus === 'accepted' && (
                  <>
                    <Button
                      onClick={() => setShowSafetyNumber(true)}
                      variant="primary" size="sm" className="w-full rounded-xl justify-between normal-case"
                    >
                      <span className="flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4" /> Mã an toàn E2EE
                      </span>
                      <span className="flex items-center gap-1 text-xs font-semibold">
                        Xem &amp; xác minh <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </Button>
                    <Button
                      onClick={() => setShowShareProfile(true)}
                      size="sm" className="!bg-base-100 border border-base-300 w-full rounded-xl justify-between normal-case"
                      title="Giới thiệu người này cho người khác qua QR/link"
                    >
                      <span className="flex items-center gap-1.5">
                        <QrCode className="w-4 h-4" /> Chia sẻ trang cá nhân
                      </span>
                      <span className="text-xs font-semibold text-base-content/40">
                        <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </Button>
                  </>
                )}

                <div className="flex items-center justify-between text-xs">
                  <span className="text-base-content/50 font-medium">Email:</span>
                  <span className="font-semibold">{profile.user.email || privateFieldFallback}</span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-base-content/50 font-medium">Số điện thoại:</span>
                  <span className="font-semibold">{profile.user.phone || privateFieldFallback}</span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-base-content/50 font-medium">Giới tính:</span>
                  <span className="font-semibold">
                    {profile.user.gender === 'male' ? 'Nam' : profile.user.gender === 'female' ? 'Nữ' : profile.user.gender === 'other' ? 'Khác' : privateFieldFallback}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-base-content/50 font-medium">Ngày sinh:</span>
                  <span className="font-semibold">
                    {profile.user.dateOfBirth ? format(new Date(profile.user.dateOfBirth), 'dd/MM/yyyy') : privateFieldFallback}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-base-content/50 font-medium">Tham gia từ:</span>
                  <span className="font-semibold">
                    {profile.user.createdAt ? format(new Date(profile.user.createdAt), 'dd/MM/yyyy') : privateFieldFallback}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <h4 className="text-xs font-bold text-base-content/40 uppercase tracking-wider flex items-center justify-between">
                  <span>Bạn chung</span>
                  <span className="badge badge-neutral badge-sm">
                    {profile.mutualFriendsCount || 0}
                  </span>
                </h4>

                {profile.mutualFriends && profile.mutualFriends.length > 0 ? (
                  <ul className="menu menu-sm p-0 gap-1 max-h-36 overflow-y-auto hide-scrollbar flex-nowrap">
                    {profile.mutualFriends.map(f => (
                      <li key={f._id}>
                        <div className="flex items-center gap-2 px-2 py-1">
                          <div className="avatar placeholder flex-shrink-0">
                            <div className="w-7 rounded-full bg-primary/10 text-primary font-bold text-xs">
                              {f.avatar ? (
                                <img src={f.avatar} alt="avatar" />
                              ) : (
                                <span>{(f.nickname || '?')[0].toUpperCase()}</span>
                              )}
                            </div>
                          </div>
                          <p className="text-xs font-semibold truncate">{f.nickname}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-base-content/40 italic bg-base-200/50 p-3 rounded-xl text-center">
                    Không có bạn chung
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <h4 className="text-xs font-bold text-base-content/40 uppercase tracking-wider flex items-center justify-between">
                  <span>Nhóm chung</span>
                  <span className="badge badge-neutral badge-sm">
                    {profile.mutualRooms?.length || 0}
                  </span>
                </h4>

                {profile.mutualRooms && profile.mutualRooms.length > 0 ? (
                  <ul className="menu menu-sm p-0 gap-1 max-h-36 overflow-y-auto hide-scrollbar flex-nowrap">
                    {profile.mutualRooms.map(room => (
                      <li key={room._id}>
                        <a
                          onClick={() => {
                            if (onSelectRoom) {
                              onSelectRoom(room);
                              onClose();
                            }
                          }}
                          className="group"
                        >
                          <div className="avatar placeholder flex-shrink-0">
                            <div className="w-8 rounded-full bg-primary/10 text-primary font-bold text-xs">
                              {room.avatar ? (
                                <img src={room.avatar} alt="room avatar" />
                              ) : (
                                <span>{(room.name || 'N')[0].toUpperCase()}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold truncate group-hover:text-primary transition-colors">
                              {room.name || 'Nhóm chat'}
                            </p>
                            <p className="text-[10px] text-base-content/40">
                              {room.members?.length || 0} thành viên
                            </p>
                          </div>
                          <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={1.8} className="text-base-content/30 group-hover:text-primary transition-colors" />
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-base-content/40 italic bg-base-200/50 p-3 rounded-xl text-center">
                    Không có nhóm chung nào
                  </p>
                )}
              </div>
            </>
          ) : null}
        </div>

        {showSafetyNumber && profile && (
          <SafetyNumberModal
            user={user}
            contactUser={profile.user}
            onClose={() => setShowSafetyNumber(false)}
            zIndex="z-[60]"
          />
        )}

        {showUnfriendConfirm && profile && (
          <ConfirmModal
            title="Hủy kết bạn?"
            description={`Bạn sẽ không còn là bạn bè với ${profile.user.nickname} và mất quyền nhắn tin trực tiếp.`}
            confirmLabel="Hủy kết bạn"
            onConfirm={handleUnfriend}
            onCancel={() => setShowUnfriendConfirm(false)}
            zIndex="z-[60]"
          />
        )}

        {showShareProfile && profile && (
          <ShareProfileModal
            userId={profile.user._id}
            displayName={profile.customAlias || profile.user.nickname}
            onClose={() => setShowShareProfile(false)}
          />
        )}
    </Modal>
  );
}
