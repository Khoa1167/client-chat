import { useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { toast } from '../common/toastStore';
import { updateRoomSettings, updateRoomAvatar } from '../../api/rooms.api';

// Đổi tên/avatar/riêng tư phòng (chỉ chủ phòng) — không tự cập nhật state ở nơi gọi, ChatWindow đã có socket listener 'room:settings_updated'.
export default function RoomSettingsModal({ room, roomName, roomAvatar, roomIsPrivate, roomJoinPolicy, onClose }) {
  const [nameInput, setNameInput] = useState(roomName || '');
  // UI hiện theo "Công khai" (đảo ngược isPrivate cho dễ hiểu)
  const [privateInput, setPrivateInput] = useState(!roomIsPrivate);
  const [approvalInput, setApprovalInput] = useState(roomJoinPolicy === 'approval');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(roomAvatar || '');
  const [saving, setSaving] = useState(false);

  const handleSelectAvatar = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateRoomSettings(room._id, {
        name: nameInput,
        isPrivate: !privateInput,
        joinPolicy: privateInput && approvalInput ? 'approval' : 'open',
      });
      if (avatarFile) {
        const formData = new FormData();
        formData.append('avatar', avatarFile);
        await updateRoomAvatar(room._id, formData);
      }
      onClose();
    } catch (err) {
      console.error('[Room] Update settings error:', err);
      toast.error(err.response?.data?.message || 'Không thể lưu cài đặt phòng');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} boxClassName="max-w-sm bg-base-100 border border-base-300 shadow-2xl">
      <h3 className="text-base font-bold mb-3">Cài đặt phòng</h3>

      <div className="flex flex-col gap-3">
        <label className="avatar self-center cursor-pointer group relative">
          <div className="w-16 rounded-full bg-gradient-to-tr from-primary to-secondary ring-2 ring-base-300 group-hover:ring-primary transition-all">
            {avatarPreview ? (
              <img src={avatarPreview} alt="avatar phòng" />
            ) : (
              <span className="w-full h-full flex items-center justify-center text-2xl">💬</span>
            )}
          </div>
          <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </div>
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleSelectAvatar} />
        </label>

        <div className="form-control flex flex-col gap-1">
          <label className="text-xs font-bold text-base-content/70">Tên phòng</label>
          <input
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            className="input input-bordered input-sm w-full bg-base-200"
            autoFocus
          />
        </div>

        <label className="flex items-center justify-between text-xs cursor-pointer bg-base-200 rounded-xl px-3 py-2.5">
          <span>
            <span className="font-semibold">Phòng công khai</span>
            <br />
            <span className="text-base-content/50">Ai cũng tìm thấy ở mục tìm kiếm</span>
          </span>
          <input
            type="checkbox"
            className="toggle toggle-sm toggle-primary"
            checked={privateInput}
            onChange={e => setPrivateInput(e.target.checked)}
          />
        </label>

        {privateInput && (
          <label className="flex items-center justify-between text-xs cursor-pointer bg-base-200 rounded-xl px-3 py-2.5">
            <span>
              <span className="font-semibold">Cần duyệt khi có người xin vào</span>
              <br />
              <span className="text-base-content/50">Bạn phải duyệt từng người tìm thấy phòng và xin vào</span>
            </span>
            <input
              type="checkbox"
              className="toggle toggle-sm toggle-primary"
              checked={approvalInput}
              onChange={e => setApprovalInput(e.target.checked)}
            />
          </label>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 mt-4">
        <Button onClick={onClose} size="sm" pill className="bg-base-200" disabled={saving}>
          Hủy
        </Button>
        <Button onClick={handleSave} variant="primary" size="sm" pill disabled={saving}>
          {saving ? 'Đang lưu...' : 'Lưu'}
        </Button>
      </div>
    </Modal>
  );
}
