import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

// Toast/banner dùng chung, đi kèm useTimedMessage(). variant="banner": khối tĩnh trong layout;
// items: nhiều thông báo cùng lúc. Class Tailwind phải viết literal (JIT không quét chuỗi ghép động).
// Nền solid (không dùng opacity nhạt như trước) — tránh nội dung phía sau đè/lẫn vào toast, cùng
// cặp bg/text-content chuẩn daisyUI mà biến thể "banner" (alert alert-${type}) bên dưới đã dùng đúng.
const TYPE_META = {
  error:   { bg: 'bg-error',   text: 'text-error-content',   textSoft: 'text-error-content/80',   close: 'text-error-content/60 hover:text-error-content',     title: 'Lỗi' },
  success: { bg: 'bg-success', text: 'text-success-content', textSoft: 'text-success-content/80', close: 'text-success-content/60 hover:text-success-content', title: 'Thành công' },
  warning: { bg: 'bg-warning', text: 'text-warning-content', textSoft: 'text-warning-content/80', close: 'text-warning-content/60 hover:text-warning-content', title: 'Cảnh báo' },
  info:    { bg: 'bg-info',    text: 'text-info-content',    textSoft: 'text-info-content/80',    close: 'text-info-content/60 hover:text-info-content',       title: 'Thông báo' },
};

export default function Toast({
  message,
  type = 'error',
  items,
  position = 'toast-top toast-center',
  z = 'z-[100]',
  variant = 'toast',
  alertClassName,
  title,
}) {
  const list = items ?? (message ? [{ id: 'msg', text: message, type }] : []);

  // Reset dismiss khi có message mới — làm ngay lúc render (không useEffect) để tránh render thừa.
  const [dismissedIds, setDismissedIds] = useState(() => new Set());
  const [prevMessage, setPrevMessage] = useState(message);
  if (message !== prevMessage) {
    setPrevMessage(message);
    setDismissedIds(new Set());
  }

  if (variant === 'banner') {
    if (!message) return null;
    return (
      <div className={`alert alert-${type} ${alertClassName || 'text-xs py-2 px-4 rounded-none'}`}>
        <span>{message}</span>
      </div>
    );
  }

  const visibleList = list.filter(item => !dismissedIds.has(item.id));

  // Không return null khi rỗng — AnimatePresence cần cây này còn mount để tự chạy xong animation
  // exit của item cuối cùng trước khi gỡ khỏi DOM, thay vì biến mất ngay theo state.
  return (
    <div className={`toast ${position} ${z} gap-2`}>
      <AnimatePresence>
        {visibleList.map(item => {
          const meta = TYPE_META[item.type || type] || TYPE_META.info;
          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className={`flex items-start gap-3 min-w-[260px] max-w-sm ${meta.bg} rounded-md shadow-lg px-4 py-3 ${alertClassName || ''}`}
            >
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold ${meta.text}`}>{title || meta.title}</p>
                <p className={`text-xs ${meta.textSoft} mt-0.5 break-words`}>{item.text}</p>
              </div>
              <button
                type="button"
                onClick={() => setDismissedIds(prev => new Set(prev).add(item.id))}
                className={`${meta.close} leading-none shrink-0`}
                aria-label="Đóng thông báo"
              >
                ✕
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
