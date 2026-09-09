import { useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';

// Popup riêng khi CHỦ PHÒNG bấm rời nhóm — cho chọn người kế nhiệm trước, khác ConfirmModal chung
// dùng cho leave/kick/transfer thường (không đủ chỗ cho danh sách chọn thành viên).
export default function LeaveOwnerModal({ roomMembers, currentUserId, onConfirm, onClose }) {
  const [newOwnerId, setNewOwnerId] = useState('');

  return (
    <Modal onClose={onClose} boxClassName="max-w-sm bg-base-100 border border-base-300 shadow-2xl">
      <h3 className="text-base font-bold mb-2">Rời nhóm — chuyển quyền chủ phòng?</h3>
      <p className="text-xs text-base-content/60 mb-4">
        Bạn đang là chủ phòng. Chọn 1 thành viên để chuyển quyền trước khi rời, hoặc bỏ qua để hệ thống tự gán chủ phòng mới.
      </p>
      <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto hide-scrollbar mb-4">
        {roomMembers
          .filter(m => (m._id || m)?.toString() !== currentUserId?.toString())
          .map(m => {
            const mid = (m._id || m)?.toString();
            return (
              <button
                key={mid}
                onClick={() => setNewOwnerId(mid)}
                className={`flex items-center gap-2 p-2 rounded-lg text-left text-sm font-medium transition-colors ${
                  newOwnerId === mid ? 'bg-primary/10 text-primary ring-1 ring-primary' : 'hover:bg-base-200'
                }`}
              >
                {m.nickname || m.username || 'Thành viên'}
              </button>
            );
          })}
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={onClose} size="sm" pill className="bg-base-200">
          Hủy
        </Button>
        <Button
          onClick={() => onConfirm(newOwnerId || undefined)}
          variant="error" size="sm" pill className="flex-1"
        >
          {newOwnerId ? 'Chuyển quyền & Rời nhóm' : 'Rời nhóm (tự động gán chủ mới)'}
        </Button>
      </div>
    </Modal>
  );
}
