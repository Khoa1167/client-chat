// Toast nổi dùng chung toàn app (gọi trực tiếp, không cần useTimedMessage/<Toast/> cục bộ) — chỉ
// 1 <ToastContainer/> ở App.jsx hiện kết quả. Không áp dụng cho variant="banner" (nằm tại layout riêng).
let listener = null;
let timer = null;

const emit = (text, type) => {
  clearTimeout(timer);
  listener?.({ text, type });
  timer = setTimeout(() => listener?.({ text: '', type }), 3500);
};

export const toast = {
  error: (text) => emit(text, 'error'),
  success: (text) => emit(text, 'success'),
};

// Dùng nội bộ bởi ToastContainer — component khác không cần gọi hàm này.
export const subscribeToast = (fn) => {
  listener = fn;
  return () => { listener = null; };
};
