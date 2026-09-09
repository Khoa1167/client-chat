// Đọc 1 cookie không-httpOnly (vd csrf_token) — token đăng nhập KHÔNG đi qua đây, nó
// httpOnly nên JS không đọc/ghi được, đúng mục đích chống XSS đánh cắp token.
export const getCookie = (name) => {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};
