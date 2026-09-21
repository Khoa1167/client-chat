import { useState } from 'react';
import { blockUser, unblockUser } from '../../api/friends.api';
import { toast } from './toastStore';
import Button from './Button';
import ConfirmModal from './ConfirmModal';

export default function BlockUserButton({ userId, displayName, blocked, onChange, className = '' }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleAction = async () => {
    setConfirming(false);
    setBusy(true);
    try {
      if (blocked) await unblockUser(userId);
      else await blockUser(userId);
      onChange?.(!blocked);
      window.dispatchEvent(new CustomEvent('user:block_changed', { detail: { userId, blocked: !blocked } }));
      toast.success(blocked ? 'Đã bỏ chặn' : 'Đã chặn người dùng');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không thể thay đổi trạng thái chặn');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button type="button" onClick={() => setConfirming(true)} disabled={busy}
        variant={blocked ? undefined : 'soft-error'} size="sm" className={className}>
        {blocked ? 'Bỏ chặn' : 'Chặn'}
      </Button>
      {confirming && (
        <ConfirmModal
          title={blocked ? `Bỏ chặn ${displayName}?` : `Chặn ${displayName}?`}
          description={blocked
            ? 'Bỏ chặn không tự động kết bạn lại.'
            : 'Hai người sẽ không thể nhắn tin trực tiếp, gọi hoặc gửi lời mời kết bạn. Quan hệ bạn bè và lời mời đang chờ sẽ bị xóa; tin nhắn cũ vẫn được giữ.'}
          confirmLabel={blocked ? 'Bỏ chặn' : 'Chặn'}
          danger={!blocked}
          onConfirm={handleAction}
          onCancel={() => setConfirming(false)}
          zIndex="z-[60]"
        />
      )}
    </>
  );
}
