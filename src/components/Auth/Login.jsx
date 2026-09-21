import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import ForgotPasswordModal from './ForgotPasswordModal';
import Turnstile from '../common/Turnstile';
import Toast from '../common/Toast';
import PasswordInput from '../common/PasswordInput';
import Spinner from '../common/Spinner';
import OtpInput from '../common/OtpInput';
import useTimedMessage from '../../hooks/useTimedMessage';
import { getPasskeyLoginOptions } from '../../api/auth.api';

const turnstileEnabled = !!import.meta.env.VITE_CLOUDFLARE_TURNSTILE_SITE_KEY;

export default function Login() {
  const [form, setForm]               = useState({ username: '', password: '' });
  const [error, showError]            = useTimedMessage();
  const [loading, setLoading]         = useState(false);
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  // Đổi sau mỗi lần submit để buộc Turnstile render lại — token chỉ dùng được 1 lần
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  // Chỉ bật cảnh báo CAPTCHA sau khi người dùng thực sự bấm Đăng nhập mà chưa xác thực xong —
  // không hiện sẵn ngay lúc mới vào trang (widget CAPTCHA thường cần vài giây để tự xác minh).
  const [captchaWarning, setCaptchaWarning] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [mfaMethods, setMfaMethods] = useState({ totp: false, passkey: false, recovery: false });
  const { login, verifyTotpLogin, verifyPasskeyLogin } = useAuth();
  const navigate                      = useNavigate();
  const location                      = useLocation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (turnstileEnabled && !turnstileToken) {
      setCaptchaWarning(true);
      return;
    }
    showError('');
    setLoading(true);
    try {
      const result = await login(form.username, form.password, turnstileToken);
      if (result.mfaRequired) {
        setMfaChallenge(result.challengeToken);
        setMfaMethods(result.methods || {});
        return;
      }
      const from = location.state?.from;
      navigate(from ? `${from.pathname}${from.search}` : '/');
    } catch (err) {
      showError(err.response?.data?.message || 'Đăng nhập thất bại');
    } finally {
      setLoading(false);
      setTurnstileToken('');
      setTurnstileResetKey(k => k + 1);
    }
  };

  const handlePasskeyLogin = async () => {
    showError('');
    setLoading(true);
    try {
      const options = await getPasskeyLoginOptions(mfaChallenge);
      const { startAuthentication } = await import('@simplewebauthn/browser');
      const assertion = await startAuthentication({ optionsJSON: options });
      await verifyPasskeyLogin(mfaChallenge, assertion, form.password);
      const from = location.state?.from;
      navigate(from ? `${from.pathname}${from.search}` : '/');
    } catch (err) {
      showError(err.response?.data?.message || err.message || 'Xác thực Passkey thất bại');
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (e) => {
    e.preventDefault();
    showError('');
    setLoading(true);
    try {
      await verifyTotpLogin(mfaChallenge, mfaCode, form.password);
      const from = location.state?.from;
      navigate(from ? `${from.pathname}${from.search}` : '/');
    } catch (err) {
      showError(err.response?.data?.message || 'Xác thực hai bước thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-theme="aurora" className="min-h-[100dvh] flex items-center justify-center bg-base-200 px-4">
      <div className="card w-full max-w-md bg-base-100 shadow-2xl border border-base-300/50">
        <div className="card-body p-8">
          <h1 className="text-3xl font-bold text-center text-primary mb-6">
            {mfaChallenge ? 'Xác thực hai bước' : 'Đăng nhập'}
          </h1>
          
          <Toast message={error} type="error" variant="banner" alertClassName="shadow-sm py-3 mb-4 rounded-lg text-sm font-medium" />
          
          {mfaChallenge ? (
            <form onSubmit={handleMfaSubmit} className="flex flex-col gap-4">
              {mfaMethods.passkey && typeof window !== 'undefined' && window.PublicKeyCredential && (
                <button type="button" className="btn btn-outline w-full" disabled={loading} onClick={handlePasskeyLogin}>
                  {loading ? <><Spinner size="sm" /> Đang xác thực...</> : 'Xác nhận bằng Passkey'}
                </button>
              )}
              {mfaMethods.passkey && (mfaMethods.totp || mfaMethods.recovery) && <div className="divider my-0 text-xs">hoặc</div>}
              {(mfaMethods.totp || useRecoveryCode) && <p className="text-sm text-center text-base-content/60">
                {useRecoveryCode
                  ? 'Nhập một mã khôi phục chưa sử dụng.'
                  : 'Nhập mã 6 số từ ứng dụng Authenticator.'}
              </p>}
              {(mfaMethods.totp || useRecoveryCode) && (useRecoveryCode ? (
                <input
                  className="input input-bordered focus:input-primary w-full font-mono uppercase"
                  value={mfaCode}
                  onChange={e => setMfaCode(e.target.value.toUpperCase().slice(0, 19))}
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  autoComplete="one-time-code"
                  autoFocus
                  required
                />
              ) : (
                <OtpInput value={mfaCode} onChange={setMfaCode} autoFocus required />
              ))}
              {mfaMethods.recovery && <button
                type="button"
                className="link link-primary text-sm"
                onClick={() => { setUseRecoveryCode(value => !value); setMfaCode(''); showError(''); }}
              >
                {useRecoveryCode ? 'Dùng mã Authenticator' : 'Dùng mã khôi phục'}
              </button>}
              {(mfaMethods.totp || useRecoveryCode) && <button type="submit" className="btn btn-primary w-full" disabled={loading || !mfaCode.trim()}>
                {loading ? <><Spinner size="sm" /> Đang xác thực...</> : 'Xác thực'}
              </button>}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => { setMfaChallenge(''); setMfaCode(''); setUseRecoveryCode(false); }}
              >
                Quay lại đăng nhập
              </button>
            </form>
          ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold text-base-content/80">Tên tài khoản</span>
              </label>
              <input
                className="input input-bordered focus:input-primary w-full transition-all duration-200"
                placeholder="Nhập tên tài khoản..."
                value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })}
                required
              />
            </div>
            
            <div className="form-control">
              <div className="flex items-center justify-between">
                <label className="label py-1">
                  <span className="label-text font-semibold text-base-content/80">Mật khẩu</span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsForgotOpen(true)}
                  className="text-xs font-semibold text-primary link link-hover"
                >
                  Quên mật khẩu?
                </button>
              </div>
              <PasswordInput
                className="input input-bordered focus:input-primary w-full transition-all duration-200"
                placeholder="Nhập mật khẩu..."
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>
            
            <Turnstile key={turnstileResetKey} onVerify={(token) => { setTurnstileToken(token); setCaptchaWarning(false); }} />
            {captchaWarning && (
              <span className="text-xs text-error flex items-center justify-center gap-1">Vui lòng xác thực CAPTCHA trước khi tiếp tục</span>
            )}

            <button
              type="submit"
              className="btn btn-primary w-full mt-2 font-bold shadow-md shadow-primary/25 hover:shadow-lg transition-all duration-200"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Spinner size="sm" />
                  Đang đăng nhập...
                </>
              ) : 'Đăng nhập'}
            </button>
          </form>
          )}
          
          {!mfaChallenge && <div className="text-center mt-6 text-sm text-base-content/60">
            Chưa có tài khoản?{' '}
            <Link to="/register" className="link link-primary link-hover font-semibold">
              Đăng ký ngay
            </Link>
          </div>}
        </div>
      </div>

      <ForgotPasswordModal
        isOpen={isForgotOpen}
        onClose={() => setIsForgotOpen(false)}
      />
    </div>
  );
}
