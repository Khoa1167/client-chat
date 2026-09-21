import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getMe, setNickname as setNicknameApi } from '../../api/auth.api';
import { useAuth } from '../../context/AuthContext';
import { setCryptoUserId } from '../../crypto';
import Toast from '../common/Toast';
import Spinner from '../common/Spinner';
import PasswordInput from '../common/PasswordInput';
import useTimedMessage from '../../hooks/useTimedMessage';

export default function SetNickname() {
  const [nickname, setNickname]   = useState('');
  const location                  = useLocation();
  const [password, setPassword]   = useState(location.state?.password || '');
  const [showPasswordInput, setShowPasswordInput] = useState(!location.state?.password);
  const [nicknameSaved, setNicknameSaved] = useState(false);
  const [error, showError]        = useTimedMessage();
  const [nicknameError, setNicknameError] = useState('');
  const [loading, setLoading]     = useState(false);
  const navigate                  = useNavigate();
  const { user, loading: authLoading, setUser, initDeviceKey } = useAuth();
  const needsNickname = !nicknameSaved && !user?.nicknameChangedAt;

  const handleSubmit = async (e) => {
    e.preventDefault();
    showError('');
    setNicknameError('');
    setLoading(true);
    try {
      const currentUser = await getMe();
      if (!currentUser.nicknameChangedAt) {
        await setNicknameApi(nickname);
      }
      setNicknameSaved(true);
      setCryptoUserId(currentUser._id);
      try {
        await initDeviceKey(password);
      } catch (err) {
        setShowPasswordInput(true);
        throw err;
      }
      setUser(await getMe());
      navigate('/', { replace: true });
    } catch (err) {
      const { field, message } = err.response?.data || {};
      if (field === 'nickname') {
        setNicknameError(message);
      } else {
        showError(message || 'Không thể hoàn tất đăng ký. Vui lòng kiểm tra mật khẩu và thử lại.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-theme="aurora" className="min-h-[100dvh] flex items-center justify-center bg-base-200 px-4">
      <div className="card w-full max-w-md bg-base-100 shadow-2xl border border-base-300/50">
        <div className="card-body p-8">
          <h1 className="text-3xl font-bold text-center text-primary mb-2">{needsNickname ? 'Biệt danh' : 'Hoàn tất đăng ký'}</h1>
          <p className="text-sm text-center text-base-content/70 mb-6">
            {needsNickname
              ? 'Tên hiển thị là tên người khác thấy khi bạn chat. Bạn có thể thay đổi sau.'
              : 'Biệt danh đã được lưu. Xác nhận mật khẩu để đăng ký thiết bị và bắt đầu chat.'}
          </p>

          <Toast message={error} type="error" variant="banner" alertClassName="shadow-sm py-3 mb-4 rounded-lg text-sm font-medium" />

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {needsNickname && <div className="form-control">
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
            </div>}

            {showPasswordInput && <div className="form-control">
              <label className="label" htmlFor="registration-password">
                <span className="label-text font-semibold text-base-content/80">Mật khẩu tài khoản</span>
              </label>
              <PasswordInput
                id="registration-password"
                className="input input-bordered focus:input-primary w-full transition-all duration-200"
                placeholder="Nhập lại mật khẩu để hoàn tất đăng ký"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>}

            <button
              type="submit"
              className="btn btn-primary w-full mt-2 font-bold shadow-md shadow-primary/25 hover:shadow-lg transition-all duration-200"
              disabled={loading || authLoading || !password || (needsNickname && nickname.trim().length < 2)}
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
