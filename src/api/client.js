import axios from 'axios';
import { getCookie } from '../utils/cookie';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true, // gửi kèm cookie token (httpOnly) + csrf_token
  timeout: 20000, // tránh request treo vô hạn khi mạng chập chờn/server không phản hồi
});

api.interceptors.request.use((config) => {
  const csrfToken = getCookie('csrf_token');
  if (csrfToken) config.headers['X-CSRF-Token'] = csrfToken;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // /auth/me: 401 là bình thường lúc check đăng nhập khi mở app — redirect ở đây sẽ lặp vô hạn.
    const url = err.config?.url || '';
    if (err.response?.status === 401 && !url.includes('/auth/login') && !url.includes('/auth/me')) {
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
