import { useState, useEffect, useRef } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import IconRail from '../components/Chat/IconRail';
import Button from '../components/common/Button';
import DatePicker from '../components/common/DatePicker';
import ProfileModal from '../components/Profile/ProfileModal';
import TotpSettings from '../components/Settings/TotpSettings';
import DeleteAccountSection from '../components/Settings/DeleteAccountSection';
import DeviceLinkModal from '../components/Settings/DeviceLinkModal';
import BackupRestoreSection from '../components/Settings/BackupRestoreSection';
import Modal from '../components/common/Modal';
import ConfirmModal from '../components/common/ConfirmModal';
import Tabs from '../components/common/Tabs';
import Toast from '../components/common/Toast';
import { toast } from '../components/common/toastStore';
import PasswordInput from '../components/common/PasswordInput';
import FieldHint from '../components/common/FieldHint';
import OtpInput from '../components/common/OtpInput';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import {
  getDevices, revokeDevice, getLoginHistory, changePassword, updateProfile,
  uploadAvatar, removeAvatar, uploadCover, removeCover, requestEmailChange, verifyEmailChange,
} from '../api/auth.api';
import { getDeviceId } from '../crypto';
import { isOnDeviceEnabled, setOnDeviceEnabled } from '../utils/onDeviceTranscriber';
import useTimedMessage from '../hooks/useTimedMessage';
import useImageUpload from '../hooks/useImageUpload';
import { getBlockedUsers, unblockUser } from '../api/friends.api';

// Khớp default trong server/src/models/User.js, dùng khi user.privacySettings chưa có. Chỉ 2 mức:
// 'friends' (bạn bè xem được) / 'private' (không ai xem được, kể cả bạn bè).
const PRIVACY_DEFAULTS = {
  bio: 'friends', activityStatus: 'friends', joinDate: 'friends',
  gender: 'friends', dateOfBirth: 'friends', email: 'friends', phone: 'friends', readReceipts: 'friends',
};

const MAX_PASSWORD_LENGTH = 30;

const GENDER_OPTIONS = [['', '-- Chưa chọn --'], ['male', 'Nam'], ['female', 'Nữ'], ['other', 'Khác']];
const GENDER_LABEL = { male: 'Nam', female: 'Nữ', other: 'Khác' };

const PRIVACY_FIELDS = [
  { key: 'bio', label: 'Tiểu sử', desc: 'Dòng giới thiệu ngắn trên trang cá nhân' },
  { key: 'activityStatus', label: 'Trạng thái hoạt động', desc: 'Đang online / lần hoạt động gần nhất' },
  { key: 'joinDate', label: 'Ngày tham gia', desc: 'Ngày tạo tài khoản' },
  { key: 'gender', label: 'Giới tính', desc: '' },
  { key: 'dateOfBirth', label: 'Ngày sinh', desc: '' },
  { key: 'email', label: 'Email', desc: '' },
  { key: 'phone', label: 'Số điện thoại', desc: '' },
  { key: 'readReceipts', label: 'Đã xem tin nhắn', desc: 'Cho bạn bè biết khi nào bạn đã đọc tin nhắn của họ' },
];

const SETTINGS_TABS = [
  { key: 'info', label: 'Thông tin cá nhân' },
  { key: 'theme', label: 'Giao diện' },
  { key: 'password', label: 'Đổi mật khẩu' },
  { key: 'security', label: 'Bảo mật' },
  { key: 'privacy', label: 'Riêng tư' },
  { key: 'blocked', label: 'Đã chặn' },
  { key: 'devices', label: 'Quản lý thiết bị' },
  { key: 'login-history', label: 'Lịch sử đăng nhập' },
];

export default function SettingsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('info');
  const [showProfile, setShowProfile] = useState(false);
  const [showDeviceLink, setShowDeviceLink] = useState(false);
  const { theme, changeTheme, availableThemes } = useTheme();
  const { user, setUser } = useAuth();
  const [blockedUsers, setBlockedUsers] = useState(null);
  const [blockedPage, setBlockedPage] = useState(0);
  const [blockedHasMore, setBlockedHasMore] = useState(false);
  const [blockedBusy, setBlockedBusy] = useState(false);
  const [blockedError, setBlockedError] = useState('');
  const [blockedReload, setBlockedReload] = useState(0);
  const [unblockTarget, setUnblockTarget] = useState(null);

  useEffect(() => {
    if (tab !== 'blocked' || blockedUsers !== null) return;
    let active = true;
    getBlockedUsers().then(data => {
      if (!active) return;
      setBlockedUsers(data.users);
      setBlockedPage(1);
      setBlockedHasMore(data.hasMore);
      setBlockedError('');
    }).catch(err => {
      if (active) setBlockedError(err.response?.data?.message || 'Không thể tải danh sách đã chặn');
    });
    return () => { active = false; };
  }, [tab, blockedUsers, blockedReload]);

  const loadMoreBlocked = async () => {
    setBlockedBusy(true);
    try {
      const data = await getBlockedUsers(blockedPage + 1);
      setBlockedUsers(prev => [...prev, ...data.users]);
      setBlockedPage(prev => prev + 1);
      setBlockedHasMore(data.hasMore);
      setBlockedError('');
    } catch (err) {
      setBlockedError(err.response?.data?.message || 'Không thể tải thêm người dùng');
    } finally {
      setBlockedBusy(false);
    }
  };

  const handleUnblock = async (userId) => {
    setUnblockTarget(null);
    setBlockedBusy(true);
    try {
      await unblockUser(userId);
      setBlockedUsers(null);
      setBlockedError('');
      window.dispatchEvent(new CustomEvent('user:block_changed', { detail: { userId, blocked: false } }));
      toast.success('Đã bỏ chặn');
    } catch (err) {
      setBlockedError(err.response?.data?.message || 'Không thể bỏ chặn');
    } finally {
      setBlockedBusy(false);
    }
  };

  // ── Tab Sửa thông tin cá nhân ── (chuyển từ ProfileModal.jsx — Profile giờ chỉ hiển thị)
  const fileInputRef = useRef(null);
  const coverInputRef = useRef(null);

  const [infoForm, setInfoForm] = useState({
    nickname: user.nickname || '',
    phone: user.phone || '',
    dateOfBirth: user.dateOfBirth ? new Date(user.dateOfBirth).toISOString().split('T')[0] : '',
    gender: user.gender || '',
    bio: user.bio || '',
  });
  const [infoError, showInfoError] = useTimedMessage();
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoSuccess, showInfoSuccess] = useTimedMessage();

  const handleSaveInfo = async (e) => {
    e.preventDefault();
    showInfoError('');
    showInfoSuccess('');
    setInfoLoading(true);
    try {
      const data = await updateProfile(infoForm);
      setUser(data);
      showInfoSuccess('Cập nhật thành công!');
    } catch (err) {
      showInfoError(err.response?.data?.message || 'Cập nhật thất bại');
    } finally {
      setInfoLoading(false);
    }
  };

  // ── Avatar & Cover — chọn/upload dùng chung qua useImageUpload, xem [[project_dedup_refactor_2026-08-18]]
  const avatar = useImageUpload({
    initial: user.avatar || '', uploadFn: uploadAvatar, formField: 'avatar',
    onSuccess: setUser, errorMessage: 'Upload avatar thất bại',
  });
  const cover = useImageUpload({
    initial: user.cover || '', uploadFn: uploadCover, formField: 'cover',
    onSuccess: setUser, errorMessage: 'Upload ảnh bìa thất bại',
  });

  const [mediaSaving, setMediaSaving] = useState(false);
  const [showDeleteAvatarConfirm, setShowDeleteAvatarConfirm] = useState(false);
  const [showDeleteCoverConfirm, setShowDeleteCoverConfirm] = useState(false);
  const discardMediaChanges = () => {
    avatar.reset(user.avatar || '');
    cover.reset(user.cover || '');
  };
  const handleSaveMedia = async () => {
    setMediaSaving(true);
    try {
      if (avatar.file && !(await avatar.onUpload())) return;
      if (cover.file && !(await cover.onUpload())) return;
      toast.success('Đã cập nhật ảnh hồ sơ');
    } finally {
      setMediaSaving(false);
    }
  };
  const handleDeleteAvatar = async () => {
    setShowDeleteAvatarConfirm(false);
    avatar.setLoading(true);
    try {
      const data = await removeAvatar();
      setUser(data);
      avatar.reset('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Xóa avatar thất bại');
    } finally {
      avatar.setLoading(false);
    }
  };
  const handleDeleteCover = async () => {
    setShowDeleteCoverConfirm(false);
    cover.setLoading(true);
    try {
      const data = await removeCover();
      setUser(data);
      cover.reset('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Xóa ảnh bìa thất bại');
    } finally {
      cover.setLoading(false);
    }
  };

  // ── Form đổi Email có xác thực OTP ──
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailStep, setEmailStep] = useState(1); // 1: password + newEmail, 2: OTP
  const [emailForm, setEmailForm] = useState({ currentPassword: '', newEmail: '', otp: '' });
  const [emailError, showEmailError] = useTimedMessage();
  const [emailSuccess, showEmailSuccess] = useTimedMessage();
  const [emailLoading, setEmailLoading] = useState(false);

  const handleRequestEmailChange = async (e) => {
    e.preventDefault();
    showEmailError('');
    showEmailSuccess('');
    setEmailLoading(true);
    try {
      const data = await requestEmailChange({
        currentPassword: emailForm.currentPassword,
        newEmail: emailForm.newEmail,
      });
      showEmailSuccess(data.message);
      setEmailStep(2);
    } catch (err) {
      showEmailError(err.response?.data?.message || 'Yêu cầu đổi email thất bại');
    } finally {
      setEmailLoading(false);
    }
  };

  const handleVerifyEmailChange = async (e) => {
    e.preventDefault();
    showEmailError('');
    showEmailSuccess('');
    setEmailLoading(true);
    try {
      const data = await verifyEmailChange({
        newEmail: emailForm.newEmail,
        otp: emailForm.otp,
      });
      setUser(data.user);
      showInfoSuccess('Đổi email thành công!');
      setShowEmailModal(false);
      setEmailStep(1);
      setEmailForm({ currentPassword: '', newEmail: '', otp: '' });
    } catch (err) {
      showEmailError(err.response?.data?.message || 'Xác nhận mã OTP thất bại');
    } finally {
      setEmailLoading(false);
    }
  };

  // ── Tab Phiên đăng nhập (thiết bị) ──
  // devices === null nghĩa là "chưa tải xong" — dùng làm cờ loading luôn (derived), tránh phải
  // setState "bắt đầu loading" đồng bộ ngay trong effect (react-hooks/set-state-in-effect).
  const [devices, setDevices] = useState(null);
  const [deviceToRevoke, setDeviceToRevoke] = useState(null);
  const [revokePassword, setRevokePassword] = useState('');
  const [revokeLoading, setRevokeLoading] = useState(false);
  const [devicesError, showDevicesError] = useTimedMessage();
  const devicesLoading = tab === 'devices' && devices === null;

  useEffect(() => {
    if (tab !== 'devices' || devices !== null) return;
    let ignore = false;
    getDevices()
      .then((data) => { if (!ignore) setDevices(data); })
      .catch(err => {
        if (ignore) return;
        showDevicesError(err.response?.data?.message || 'Không thể tải danh sách thiết bị');
        setDevices([]);
      });
    return () => { ignore = true; };
  }, [tab, devices, showDevicesError]);

  const closeRevokeModal = () => {
    setDeviceToRevoke(null);
    setRevokePassword('');
  };

  const handleRevokeDevice = async (e) => {
    e.preventDefault();
    if (!deviceToRevoke) return;
    setRevokeLoading(true);
    try {
      await revokeDevice(deviceToRevoke.deviceId, revokePassword);
      setDevices(prev => (prev || []).filter(d => d.deviceId !== deviceToRevoke.deviceId));
      closeRevokeModal();
    } catch (err) {
      showDevicesError(err.response?.data?.message || 'Không thể gỡ thiết bị');
    } finally {
      setRevokeLoading(false);
    }
  };

  // ── Tab Lịch sử đăng nhập ── cùng mẫu lazy-load như tab Devices ở trên.
  const [loginHistory, setLoginHistory] = useState(null);
  const [loginHistoryError, showLoginHistoryError] = useTimedMessage();
  const loginHistoryLoading = tab === 'login-history' && loginHistory === null;

  useEffect(() => {
    if (tab !== 'login-history' || loginHistory !== null) return;
    let ignore = false;
    getLoginHistory()
      .then((data) => { if (!ignore) setLoginHistory(data); })
      .catch(err => {
        if (ignore) return;
        showLoginHistoryError(err.response?.data?.message || 'Không thể tải lịch sử đăng nhập');
        setLoginHistory([]);
      });
    return () => { ignore = true; };
  }, [tab, loginHistory, showLoginHistoryError]);

  // ── Form đổi mật khẩu ──
  const [pwForm, setPwForm] = useState({
    currentPassword: '', newPassword: '', confirmPassword: ''
  });
  const [pwError, showPwError] = useTimedMessage();
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSuccess, showPwSuccess] = useTimedMessage();

  const handleChangePassword = async (e) => {
    e.preventDefault();
    showPwError('');
    showPwSuccess('');

    if (pwForm.newPassword.length < 8 || pwForm.newPassword.length > MAX_PASSWORD_LENGTH) {
      showPwError(`Mật khẩu mới phải có từ 8-${MAX_PASSWORD_LENGTH} ký tự`); return;
    }
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      showPwError('Mật khẩu mới xác nhận không khớp'); return;
    }

    setPwLoading(true);
    try {
      await changePassword({
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      showPwSuccess('Đổi mật khẩu thành công!');
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      showPwError(err.response?.data?.message || 'Đổi mật khẩu thất bại');
    } finally {
      setPwLoading(false);
    }
  };

  // ── Tab Riêng tư ── ai xem được từng trường thông tin trên trang cá nhân (Công khai/Bạn bè/
  // Chỉ mình tôi) — xem server/src/services/friends.service.js getProfile().
  const [privacyForm, setPrivacyForm] = useState({ ...PRIVACY_DEFAULTS, ...user?.privacySettings });
  const [privacyLoading, setPrivacyLoading] = useState(false);
  const [privacyError, showPrivacyError] = useTimedMessage();
  const [privacySuccess, showPrivacySuccess] = useTimedMessage();

  // Riêng trình duyệt này (localStorage, không đồng bộ server) — bật/tắt phiên âm giọng nói
  // on-device cho voice note (xem client/src/utils/onDeviceTranscriber.js, MessageItem.jsx).
  const [onDeviceOn, setOnDeviceOn] = useState(isOnDeviceEnabled);

  const handleSavePrivacy = async (e) => {
    e.preventDefault();
    showPrivacyError('');
    showPrivacySuccess('');
    setPrivacyLoading(true);
    try {
      const data = await updateProfile({ privacySettings: privacyForm });
      setUser(data);
      showPrivacySuccess('Đã lưu cài đặt riêng tư!');
    } catch (err) {
      showPrivacyError(err.response?.data?.message || 'Không thể lưu cài đặt riêng tư');
    } finally {
      setPrivacyLoading(false);
    }
  };

  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden bg-base-100 text-base-content">
      <IconRail
        onSelectChat={() => navigate('/')}
        onSelectFriends={() => navigate('/', { state: { view: 'friends' } })}
        onOpenProfile={() => setShowProfile(true)}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-base-300 flex-shrink-0">
          <h1 className="text-lg font-bold">Cài đặt</h1>
        </div>

        <div className="px-4 sm:px-6 pt-3 flex-shrink-0 overflow-x-auto hide-scrollbar">
          <Tabs active={tab} onChange={setTab} tabs={SETTINGS_TABS} />
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-20 md:pb-6 relative">
          <div className="max-w-lg w-full mx-auto">
            {/* Thông tin cá nhân */}
            {tab === 'info' && (
              <div className="flex flex-col gap-5">
                {/* Cover & Avatar Header */}
                <div className="flex flex-col items-center gap-3">
                  <div className="relative w-full h-32 rounded-xl bg-gradient-to-r from-primary to-secondary overflow-hidden shadow-xs group">
                    {cover.preview ? (
                      <img src={cover.preview} alt="cover" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-r from-primary to-secondary flex items-center justify-center text-primary-content/50 text-xs font-semibold">
                        Chưa có ảnh bìa
                      </div>
                    )}
                    <div
                      className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1.5 cursor-pointer backdrop-blur-[1px]"
                      onClick={() => coverInputRef.current?.click()}
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                      <span>Đổi ảnh bìa</span>
                    </div>

                    {user.cover && !cover.file && (
                      <button
                        type="button"
                        className="btn btn-xs bg-black/60 hover:bg-error border-none text-white absolute top-2.5 right-2.5 z-10 opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDeleteCoverConfirm(true);
                        }}
                        title="Xóa ảnh bìa"
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.8} /> Xóa ảnh bìa
                      </button>
                    )}

                    {showDeleteCoverConfirm && (
                      <ConfirmModal
                        title="Xóa ảnh bìa?"
                        description="Ảnh bìa hiện tại sẽ bị xóa khỏi hồ sơ của bạn."
                        confirmLabel="Xóa"
                        onConfirm={handleDeleteCover}
                        onCancel={() => setShowDeleteCoverConfirm(false)}
                      />
                    )}

                    <input
                      type="file"
                      ref={coverInputRef}
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={cover.onSelect}
                    />
                  </div>

                  <div
                    className="avatar group relative cursor-pointer shadow-md -mt-10"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="w-20 rounded-full bg-primary text-primary-content font-bold text-2xl ring-4 ring-base-100 shadow-md">
                      {avatar.preview ? (
                        <img src={avatar.preview} alt="avatar" />
                      ) : (
                        <span className="w-full h-full flex items-center justify-center">{(user.nickname || user.username)[0].toUpperCase()}</span>
                      )}
                    </div>
                    <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                    </div>
                    {user.avatar && !avatar.file && (
                      <button
                        type="button"
                        className="btn btn-xs btn-circle bg-black/60 hover:bg-error border-none text-white absolute -top-1 -right-1 z-10 opacity-100 md:opacity-0 md:group-hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); setShowDeleteAvatarConfirm(true); }}
                        title="Xóa avatar"
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.8} />
                      </button>
                    )}
                  </div>

                  {showDeleteAvatarConfirm && (
                    <ConfirmModal
                      title="Xóa avatar?"
                      description="Avatar hiện tại sẽ bị xóa khỏi hồ sơ của bạn."
                      confirmLabel="Xóa"
                      onConfirm={handleDeleteAvatar}
                      onCancel={() => setShowDeleteAvatarConfirm(false)}
                    />
                  )}

                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={avatar.onSelect}
                  />
                </div>

                <form onSubmit={handleSaveInfo} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-base-content/50 uppercase tracking-wider">Tên tài khoản</label>
                    <input value={user.username} disabled className="input input-bordered input-sm bg-base-200 text-base-content/40 w-full select-none" />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-base-content/50 uppercase tracking-wider">Biệt danh</label>
                    <p className="text-[10px] text-base-content/40">
                      Biệt danh chỉ được thay đổi <strong className="text-base-content font-semibold">7 ngày 1 lần</strong>
                    </p>
                    <input
                      className="input input-bordered input-sm focus:input-primary w-full"
                      placeholder="Tên hiển thị (2 - 20 ký tự)"
                      value={infoForm.nickname}
                      onChange={e => setInfoForm(prev => ({ ...prev, nickname: e.target.value }))}
                      minLength={2}
                      maxLength={20}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-base-content/50 uppercase tracking-wider">Email</label>
                      <Button
                        onClick={() => {
                          showEmailError('');
                          showEmailSuccess('');
                          setEmailStep(1);
                          setEmailForm({ currentPassword: '', newEmail: '', otp: '' });
                          setShowEmailModal(true);
                        }}
                        size="xs"
                        className="!text-primary"
                      >
                        Đổi Email
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="email"
                        disabled
                        className="input input-bordered input-sm bg-base-200 text-base-content/50 w-full select-none"
                        value={user.email || ''}
                      />
                      <span className="badge badge-success badge-outline shrink-0 gap-1">
                        <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} strokeWidth={1.8} /> Đã xác minh
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-base-content/50 uppercase tracking-wider">Số điện thoại</label>
                    <FieldHint hint="7-15 chữ số, có thể có dấu + ở đầu">
                      <input
                        className="input input-bordered input-sm focus:input-primary w-full"
                        value={infoForm.phone}
                        onChange={e => setInfoForm({ ...infoForm, phone: e.target.value })}
                        placeholder="Chưa thêm số điện thoại"
                      />
                    </FieldHint>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-base-content/50 uppercase tracking-wider">Ngày sinh</label>
                    <DatePicker
                      value={infoForm.dateOfBirth}
                      onChange={dateOfBirth => setInfoForm(prev => ({ ...prev, dateOfBirth }))}
                      placeholder="Chọn ngày sinh"
                      ariaLabel="Chọn ngày sinh"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-base-content/50 uppercase tracking-wider">Giới tính</label>
                    {/* Dropdown tự làm thay vì <select> native — popup native mobile do OS vẽ, không
                        đóng/mở nhất quán được như PC. Cùng pattern .dropdown+label tabIndex với Ngày sinh ở trên. */}
                    <div className="dropdown w-full">
                      <label
                        tabIndex={0}
                        className="input input-bordered input-sm focus:input-primary w-full cursor-pointer flex items-center"
                      >
                        {GENDER_LABEL[infoForm.gender] || '-- Chưa chọn --'}
                      </label>
                      <ul tabIndex={0} className="dropdown-content menu menu-sm bg-base-100 border border-base-300 rounded-lg shadow-lg z-10 mt-1 w-full">
                        {GENDER_OPTIONS.map(([value, label]) => (
                          <li key={value}>
                            <a onClick={() => { setInfoForm({ ...infoForm, gender: value }); document.activeElement?.blur(); }}>
                              {label}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-base-content/50 uppercase tracking-wider">Mô tả bản thân</label>
                      <span className="text-[10px] text-base-content/40 font-medium">{infoForm.bio.length}/150</span>
                    </div>
                    <textarea
                      rows={3}
                      maxLength={150}
                      className="textarea textarea-bordered focus:textarea-primary text-sm w-full resize-none"
                      placeholder="Giới thiệu một chút về bản thân bạn..."
                      value={infoForm.bio}
                      onChange={e => setInfoForm({ ...infoForm, bio: e.target.value })}
                    />
                  </div>

                  <Toast message={infoError} type="error" variant="banner" alertClassName="py-2 px-3 text-xs font-semibold rounded-lg" />
                  <Toast message={infoSuccess} type="success" variant="banner" alertClassName="py-2 px-3 text-xs font-semibold rounded-lg" />

                  <Button type="submit" variant="primary" className="rounded-full mt-2 w-fit" disabled={infoLoading}>
                    {infoLoading ? 'Đang lưu...' : 'Lưu thay đổi'}
                  </Button>
                </form>

                {/* Lưu avatar và ảnh bìa đã chọn trong một lần xác nhận. */}
                {(avatar.file || cover.file) && (
                  <div className="fixed bottom-4 left-4 right-4 md:left-auto md:w-96 z-30 bg-neutral text-neutral-content backdrop-blur-md p-3.5 rounded-xl shadow-2xl flex items-center justify-between border border-white/10 animate-fade-in">
                    <div className="text-xs font-semibold">
                      <span>{avatar.file && cover.file ? 'Xác nhận lưu avatar và ảnh bìa mới?' : `Xác nhận lưu ${avatar.file ? 'avatar' : 'ảnh bìa'} mới?`}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={discardMediaChanges}
                        className="btn btn-xs bg-white/10 hover:bg-white/20 border-none text-neutral-content/70 hover:text-white"
                        disabled={mediaSaving}
                      >
                        Hủy
                      </button>
                      <Button
                        type="button"
                        variant="primary"
                        onClick={handleSaveMedia}
                        disabled={mediaSaving}
                        className="btn-xs"
                      >
                        {mediaSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Modal Đổi Email Bảo Mật (OTP) */}
                {showEmailModal && (
                  <Modal onClose={() => setShowEmailModal(false)} boxClassName="max-w-sm bg-base-100 border border-base-300 shadow-2xl">
                    <div className="flex items-center justify-between border-b border-base-300 pb-3 mb-4">
                      <h3 className="text-base font-bold">
                        {emailStep === 1 ? 'Thay đổi địa chỉ Email' : 'Nhập mã xác minh OTP'}
                      </h3>
                      <Button
                        type="button"
                        onClick={() => setShowEmailModal(false)}
                        className="btn-sm btn-circle"
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.8} />
                      </Button>
                    </div>

                    {emailStep === 1 ? (
                      <form onSubmit={handleRequestEmailChange} className="flex flex-col gap-4">
                        <p className="text-xs text-base-content/60">
                          Để đảm bảo an toàn tài khoản, vui lòng nhập <strong>mật khẩu hiện tại</strong> và <strong>email mới</strong>. Mã OTP xác thực sẽ được gửi tới <strong>email mới</strong> và một thông báo cảnh báo bảo mật sẽ được gửi về <strong>email hiện tại</strong> của bạn.
                        </p>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-base-content/50 uppercase tracking-wider">Mật khẩu hiện tại</label>
                          <PasswordInput
                            required
                            className="input input-bordered input-sm focus:input-primary w-full"
                            value={emailForm.currentPassword}
                            onChange={e => setEmailForm({ ...emailForm, currentPassword: e.target.value })}
                            placeholder="••••••••"
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-base-content/50 uppercase tracking-wider">Email mới</label>
                          <FieldHint hint="Định dạng email hợp lệ, vd: ten@example.com">
                            <input
                              type="email"
                              required
                              className="input input-bordered input-sm focus:input-primary w-full"
                              value={emailForm.newEmail}
                              onChange={e => setEmailForm({ ...emailForm, newEmail: e.target.value })}
                              placeholder="example@gmail.com"
                            />
                          </FieldHint>
                        </div>

                        <Toast message={emailError} type="error" variant="banner" alertClassName="py-2 px-3 text-xs font-semibold rounded-lg" />

                        <div className="flex items-center justify-end gap-2 mt-2">
                          <Button
                            type="button"
                            onClick={() => setShowEmailModal(false)}
                            className="btn-sm bg-base-200 rounded-full"
                          >
                            Hủy
                          </Button>
                          <Button
                            type="submit"
                            variant="primary"
                            disabled={emailLoading}
                            className="btn-sm rounded-full"
                          >
                            {emailLoading ? 'Đang gửi mã...' : 'Gửi mã OTP'}
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <form onSubmit={handleVerifyEmailChange} className="flex flex-col gap-4">
                        <div className="alert alert-info text-xs py-2.5 px-3 rounded-lg">
                          <span>{emailSuccess || `Mã OTP 6 số đã được gửi tới địa chỉ email mới (${emailForm.newEmail}).`}</span>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-base-content/50 uppercase tracking-wider">Mã OTP (6 chữ số)</label>
                          <div className="flex justify-center">
                            <OtpInput
                              value={emailForm.otp}
                              onChange={otp => setEmailForm({ ...emailForm, otp })}
                              className="otp-primary"
                              required
                            />
                          </div>
                        </div>

                        <Toast message={emailError} type="error" variant="banner" alertClassName="py-2 px-3 text-xs font-semibold rounded-lg" />

                        <div className="flex items-center justify-between mt-2">
                          <Button
                            onClick={() => setEmailStep(1)}
                            size="xs"
                            className="!text-primary"
                          >
                            ← Nhập lại email
                          </Button>
                          <Button
                            type="submit"
                            variant="primary"
                            disabled={emailLoading}
                            className="btn-sm rounded-full"
                          >
                            {emailLoading ? 'Đang xác thực...' : 'Xác nhận Đổi Email'}
                          </Button>
                        </div>
                      </form>
                    )}
                  </Modal>
                )}
              </div>
            )}

            {/* Giao diện */}
            {tab === 'theme' && (
              <div className="grid grid-cols-2 gap-2">
                {availableThemes.map(t => (
                  <Button
                    key={t.id}
                    type="button"
                    active={theme === t.id}
                    onClick={() => changeTheme(t.id)}
                    className={`btn-sm justify-start rounded-lg ${theme === t.id ? '' : 'bg-base-100'}`}
                  >
                    {t.name}
                  </Button>
                ))}
              </div>
            )}

            {/* Đổi mật khẩu */}
            {tab === 'password' && (
              <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-base-content/50 uppercase tracking-wider">Mật khẩu hiện tại</label>
                  <PasswordInput
                    className="input input-bordered input-sm focus:input-primary w-full"
                    value={pwForm.currentPassword}
                    onChange={e => setPwForm({ ...pwForm, currentPassword: e.target.value })}
                    required
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-base-content/50 uppercase tracking-wider">Mật khẩu mới</label>
                  <FieldHint hint={`Mật khẩu dài 8-${MAX_PASSWORD_LENGTH} ký tự`}>
                    <PasswordInput
                      className="input input-bordered input-sm focus:input-primary w-full"
                      placeholder={`8-${MAX_PASSWORD_LENGTH} ký tự...`}
                      value={pwForm.newPassword}
                      onChange={e => setPwForm({ ...pwForm, newPassword: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && pwForm.newPassword.length >= MAX_PASSWORD_LENGTH) {
                          showPwError(`Mật khẩu không được vượt quá ${MAX_PASSWORD_LENGTH} ký tự`);
                        }
                      }}
                      required minLength={8} maxLength={MAX_PASSWORD_LENGTH}
                    />
                  </FieldHint>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-base-content/50 uppercase tracking-wider">Xác nhận mật khẩu mới</label>
                  <PasswordInput
                    className="input input-bordered input-sm focus:input-primary w-full"
                    value={pwForm.confirmPassword}
                    onChange={e => setPwForm({ ...pwForm, confirmPassword: e.target.value })}
                    required
                  />
                </div>

                <Toast message={pwError} type="error" variant="banner" alertClassName="py-2 px-3 text-xs font-semibold rounded-lg" />
                <Toast message={pwSuccess} type="success" variant="banner" alertClassName="py-2 px-3 text-xs font-semibold rounded-lg" />

                <Button type="submit" variant="primary" className="rounded-full mt-2 w-fit" disabled={pwLoading}>
                  {pwLoading ? 'Đang đổi...' : 'Đổi mật khẩu'}
                </Button>
              </form>
            )}

            {tab === 'security' && (
              <>
                <TotpSettings />
                <DeleteAccountSection />
              </>
            )}

            {tab === 'blocked' && (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-base-content/60">
                  Người bị chặn không thể nhắn tin trực tiếp, gọi hoặc gửi lời mời kết bạn với bạn. Nhóm chung không bị ảnh hưởng.
                </p>
                {blockedUsers === null ? (
                  <p className="text-sm text-base-content/50" role="status">{blockedError || 'Đang tải danh sách...'}</p>
                ) : blockedUsers.length === 0 ? (
                  <p className="text-sm text-base-content/50">Bạn chưa chặn ai.</p>
                ) : blockedUsers.map(entry => (
                  <div key={entry._id} className="flex items-center gap-3 p-3 rounded-lg border border-base-300 bg-base-100">
                    <div className="avatar flex-shrink-0">
                      <div className="w-10 rounded-full bg-primary text-primary-content font-bold">
                        {entry.avatar ? <img src={entry.avatar} alt="" /> : <span className="w-full h-full flex items-center justify-center">{(entry.nickname || '?')[0].toUpperCase()}</span>}
                      </div>
                    </div>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{entry.nickname}</span>
                    <Button type="button" size="sm" className="bg-base-200 shrink-0"
                      disabled={blockedBusy} onClick={() => setUnblockTarget(entry)}>
                      Bỏ chặn
                    </Button>
                  </div>
                ))}
                {blockedHasMore && blockedUsers !== null && (
                  <Button type="button" size="sm" className="self-center bg-base-200" disabled={blockedBusy} onClick={loadMoreBlocked}>
                    Xem thêm
                  </Button>
                )}
                {blockedUsers !== null && blockedError && <p role="alert" className="text-sm text-error">{blockedError}</p>}
                {blockedUsers === null && blockedError && (
                  <Button type="button" size="sm" className="self-start bg-base-200" onClick={() => { setBlockedError(''); setBlockedReload(prev => prev + 1); }}>
                    Thử lại
                  </Button>
                )}
              </div>
            )}

            {/* Riêng tư */}
            {tab === 'privacy' && (
              <form onSubmit={handleSavePrivacy} className="flex flex-col gap-3">
                <p className="text-xs text-base-content/50 -mt-1 mb-1">
                  Ẩn thì không ai xem được (kể cả bạn bè). Hiện thì chỉ bạn bè xem được — người lạ
                  luôn luôn không xem được.
                </p>

                {PRIVACY_FIELDS.map(({ key, label, desc }) => (
                  <label key={key} className="flex items-center justify-between gap-3 text-xs cursor-pointer bg-base-100 rounded-xl px-3 py-2.5 border border-base-300">
                    <span className="flex-1 min-w-0">
                      <span className="font-semibold">{label}</span>
                      {desc && (
                        <>
                          <br />
                          <span className="text-base-content/50">{desc}</span>
                        </>
                      )}
                    </span>
                    <span className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[11px] font-semibold text-base-content/60 w-8 text-right">
                        {privacyForm[key] === 'friends' ? 'Hiện' : 'Ẩn'}
                      </span>
                      <input
                        type="checkbox"
                        className="toggle toggle-primary"
                        checked={privacyForm[key] === 'friends'}
                        onChange={e => setPrivacyForm(prev => ({ ...prev, [key]: e.target.checked ? 'friends' : 'private' }))}
                      />
                    </span>
                  </label>
                ))}

                <Toast message={privacyError} type="error" variant="banner" alertClassName="py-2 px-3 text-xs font-semibold rounded-lg" />
                <Toast message={privacySuccess} type="success" variant="banner" alertClassName="py-2 px-3 text-xs font-semibold rounded-lg" />

                <Button type="submit" variant="primary" className="rounded-full mt-2 w-fit" disabled={privacyLoading}>
                  {privacyLoading ? 'Đang lưu...' : 'Lưu cài đặt riêng tư'}
                </Button>
              </form>
            )}

            {/* Phiên âm on-device — riêng trình duyệt này, không đồng bộ tài khoản nên tách khỏi
                form Riêng tư ở trên (bấm là ghi localStorage ngay, không cần nút Lưu riêng). */}
            {tab === 'privacy' && (
              <div className="mt-4 pt-4 border-t border-base-300">
                <label className="flex items-center justify-between gap-3 text-xs cursor-pointer bg-base-100 rounded-xl px-3 py-2.5 border border-base-300">
                  <span className="flex-1 min-w-0">
                    <span className="font-semibold">Phiên âm giọng nói trên thiết bị</span>
                    <br />
                    <span className="text-base-content/50">
                      Xử lý ngay trên máy này khi bấm "Xem bản dịch chữ" cho tin nhắn thoại — audio
                      không rời khỏi thiết bị. Chỉ áp dụng cho trình duyệt này, cần tải lại
                      (~150MB, lần dùng đầu tiên) nếu đổi máy hoặc xóa dữ liệu trình duyệt.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary flex-shrink-0"
                    checked={onDeviceOn}
                    onChange={e => {
                      setOnDeviceOn(e.target.checked);
                      setOnDeviceEnabled(e.target.checked);
                    }}
                  />
                </label>
                <BackupRestoreSection />
              </div>
            )}

            {/* Phiên đăng nhập (thiết bị) */}
            {tab === 'devices' && (
              <div className="flex flex-col gap-3">
                {devicesLoading ? (
                  <p className="text-xs text-base-content/50">Đang tải...</p>
                ) : (
                  <p className="text-xs text-base-content/50">{(devices || []).length}/5 thiết bị</p>
                )}

                {!devicesLoading && (devices || []).map(d => {
                  const isCurrent = d.deviceId === getDeviceId();
                  return (
                    <div key={d.deviceId} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-base-100 border border-base-300">
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate flex items-center gap-1.5">
                          {d.deviceName}
                          {isCurrent && (
                            <span className="badge badge-primary badge-xs text-white font-semibold">Thiết bị này</span>
                          )}
                        </p>
                        <p className="text-xs text-base-content/50">
                          Hoạt động {formatDistanceToNow(new Date(d.lastActiveAt), { addSuffix: true, locale: vi })}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="error"
                        className="btn-xs rounded-full flex-shrink-0"
                        disabled={isCurrent}
                        title={isCurrent ? 'Dùng nút Đăng xuất để gỡ thiết bị này' : undefined}
                        onClick={() => setDeviceToRevoke(d)}
                      >
                        Gỡ
                      </Button>
                    </div>
                  );
                })}

                <Button type="button" onClick={() => setShowDeviceLink(true)} variant="primary" className="btn-sm rounded-full self-start">
                  Liên kết thiết bị mới
                </Button>

                <Toast message={devicesError} type="error" variant="banner" alertClassName="py-2 px-3 text-xs font-semibold rounded-lg" />
              </div>
            )}

            {/* Lịch sử đăng nhập */}
            {tab === 'login-history' && (
              <div className="flex flex-col gap-2">
                {loginHistoryLoading ? (
                  <p className="text-xs text-base-content/50">Đang tải...</p>
                ) : (loginHistory || []).length === 0 ? (
                  <p className="text-xs text-base-content/50">Chưa có lịch sử đăng nhập nào.</p>
                ) : (
                  (loginHistory || []).map(h => (
                    <div key={h._id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-base-100 border border-base-300">
                      <div className="min-w-0">
                        <p className="text-sm font-bold flex items-center gap-1.5">
                          {h.success ? (
                            <span className="badge badge-success badge-xs text-white font-semibold">Thành công</span>
                          ) : (
                            <span className="badge badge-error badge-xs text-white font-semibold">Thất bại</span>
                          )}
                          <span className="text-xs font-normal text-base-content/60">{h.ip || 'Không rõ IP'}</span>
                        </p>
                        <p className="text-xs text-base-content/50 truncate" title={h.userAgent}>
                          {formatDistanceToNow(new Date(h.createdAt), { addSuffix: true, locale: vi })} · {h.userAgent || 'Không rõ trình duyệt'}
                        </p>
                      </div>
                    </div>
                  ))
                )}

                <Toast message={loginHistoryError} type="error" variant="banner" alertClassName="py-2 px-3 text-xs font-semibold rounded-lg" />
              </div>
            )}
          </div>
        </div>
      </div>

      {deviceToRevoke && (
        <Modal onClose={closeRevokeModal} boxClassName="max-w-sm bg-base-100 border border-base-300 shadow-2xl">
          <form onSubmit={handleRevokeDevice} className="flex flex-col gap-4">
            <div>
              <h3 className="text-base font-bold mb-1">Gỡ thiết bị "{deviceToRevoke.deviceName}"?</h3>
              <p className="text-xs text-base-content/60">
                Thiết bị này sẽ cần đăng nhập và đăng ký lại từ đầu để dùng tiếp. Nhập mật khẩu để xác nhận.
              </p>
            </div>

            <PasswordInput
              className="input input-bordered input-sm focus:input-primary w-full"
              value={revokePassword}
              onChange={e => setRevokePassword(e.target.value)}
              placeholder="Mật khẩu hiện tại"
              autoFocus
              required
            />

            <Toast message={devicesError} type="error" variant="banner" alertClassName="py-2 px-3 text-xs font-semibold rounded-lg" />

            <div className="flex items-center justify-end gap-2">
              <Button type="button" onClick={closeRevokeModal} className="btn-sm bg-base-200 rounded-full">
                Hủy
              </Button>
              <Button type="submit" variant="error" disabled={revokeLoading} className="btn-sm rounded-full">
                {revokeLoading ? 'Đang gỡ...' : 'Gỡ'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {unblockTarget && (
        <ConfirmModal title={`Bỏ chặn ${unblockTarget.nickname}?`}
          description="Bỏ chặn không tự động kết bạn lại."
          confirmLabel="Bỏ chặn" danger={false}
          onConfirm={() => handleUnblock(unblockTarget._id)}
          onCancel={() => setUnblockTarget(null)} />
      )}

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
      {showDeviceLink && <DeviceLinkModal user={user} onClose={() => setShowDeviceLink(false)} />}
    </div>
  );
}
