import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { setNickname as setNicknameApi } from '../../api/auth.api';
import { useAuth } from '../../context/AuthContext';
import Toast from '../common/Toast';
import Spinner from '../common/Spinner';
import useTimedMessage from '../../hooks/useTimedMessage';

export default function SetNickname() {
  const [nickname, setNickname]   = useState('');
  const [error, showError]        = useTimedMessage();
  const [nicknameError, setNicknameError] = useState('');
  const [loading, setLoading]     = useState(false);
  const navigate                  = useNavigate();
  const location                  = useLocation();
  const { setUser, initDeviceKey } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    showError('');
    setNicknameError('');
    setLoading(true);
    try {
      const data = await setNicknameApi(nickname);
      setUser(data);

      // Đăng ký khóa E2EE ngay sau đăng ký (giống login()) — thiếu bước này tài khoản kẹt ở bootstrap token.
      const password = location.state?.password;
      if (password) {
        try {
          await initDeviceKey(password);
        } catch (err) {
          // Chỉ log message — xem ghi chú tương tự trong AuthContext.jsx#login (err.config.data
          // giữ nguyên currentPassword plaintext của request registerDevice vừa gửi).
          console.warn('[E2EE] Initial device registration warning:', err.message);
        }
      }

      navigate('/');
    } catch (err) {
      const { field, message } = err.response?.data || {};
      if (field === 'nickname') {
        setNicknameError(message);
      } else {
        showError(message || 'Đặt nickname thất bại');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-theme="aurora" className="min-h-screen flex items-center justify-center bg-base-200 px-4">
      <div className="card w-full max-w-md bg-base-100 shadow-2xl border border-base-300/50">
        <div className="card-body p-8">
          <h1 className="text-3xl font-bold text-center text-primary mb-2">Biệt danh</h1>
          <p className="text-sm text-center text-base-content/70 mb-6">
            Tên hiển thị là tên người khác thấy khi bạn chat. Bạn có thể thay đổi sau.
          </p>

          <Toast message={error} type="error" variant="banner" alertClassName="shadow-sm py-3 mb-4 rounded-lg text-sm font-medium" />

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold text-base-content/80">Tên hiển thị (nickname)</span>
              </label>
              <input
                className="input input-bordered focus:input-primary w-full transition-all duration-200"
                placeholder="Nhập tên hiển thị (2 - 20 ký tự)..."
                value={nickname}
                onChange={e => {
                  setNickname(e.target.value);
                  if (nicknameError) setNicknameError('');
                }}
                required
                minLength={2}
                maxLength={20}
              />
              <div className="min-h-[20px]">
                {nicknameError && (
                  <span className="text-xs text-error flex items-center gap-1 mt-1">{nicknameError}</span>
                )}
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary w-full mt-2 font-bold shadow-md shadow-primary/25 hover:shadow-lg transition-all duration-200"
              disabled={loading || nickname.trim().length < 2}
            >
              {loading ? (
                <>
                  <Spinner size="sm" />
                  Đang lưu...
                </>
              ) : 'Xác nhận'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
