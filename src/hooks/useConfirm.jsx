import { useState, useRef, useCallback } from 'react';
import ConfirmModal from '../components/common/ConfirmModal';

// Thay window.confirm() (blocking, xấu, không đồng bộ giao diện) ở những chỗ cần "dừng chờ" xác
// nhận ngay giữa 1 hàm async (vd đang gửi tin nhắn, phải hỏi trước khi tiếp tục) mà không tiện tách
// riêng thành nút bấm mở modal như ConfirmModal dùng trực tiếp ở các nơi khác.
// Dùng: const { confirm, confirmModal } = useConfirm(); ... if (!await confirm('Tiêu đề', 'Mô tả')) return;
// Nhớ render {confirmModal} ở đâu đó trong JSX của component gọi hook.
export default function useConfirm() {
  const [state, setState] = useState(null);
  const resolveRef = useRef(null);

  const confirm = useCallback((title, description, opts = {}) => {
    return new Promise(resolve => {
      resolveRef.current = resolve;
      setState({ title, description, ...opts });
    });
  }, []);

  const settle = (result) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setState(null);
  };

  const confirmModal = state ? (
    <ConfirmModal
      title={state.title}
      description={state.description}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      danger={state.danger}
      zIndex={state.zIndex}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  ) : null;

  return { confirm, confirmModal };
}
