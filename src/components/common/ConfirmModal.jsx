import Modal from './Modal';
import Button from './Button';

// Modal hỏi-xác nhận dùng chung — thay khối JSX "tiêu đề + mô tả + nút Hủy/nút hành động đỏ"
// đang bị viết tay lặp lại ở nhiều nơi (đăng xuất, rời/kick nhóm, gỡ thiết bị...).
export default function ConfirmModal({
  title,
  description,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  danger = true,
  onConfirm,
  onCancel,
  zIndex,
}) {
  return (
    <Modal onClose={onCancel} boxClassName="max-w-sm bg-base-100 border border-base-300 shadow-2xl" zIndex={zIndex}>
      <h3 className="text-base font-bold mb-2">{title}</h3>
      {description && <p className="text-xs text-base-content/60 mb-4">{description}</p>}
      <div className="flex items-center justify-end gap-2">
        <Button onClick={onCancel} size="sm" pill className="bg-base-200">
          {cancelLabel}
        </Button>
        <Button onClick={onConfirm} variant={danger ? 'error' : 'primary'} size="sm" pill>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
