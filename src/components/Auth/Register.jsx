import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { sendOtp, verifyOtp } from '../../api/auth.api';
import Turnstile from '../common/Turnstile';
import Button from '../common/Button';
import Toast from '../common/Toast';
import PasswordInput from '../common/PasswordInput';
import OtpInput from '../common/OtpInput';
import Spinner from '../common/Spinner';
import useTimedMessage from '../../hooks/useTimedMessage';

const turnstileEnabled = !!import.meta.env.VITE_CLOUDFLARE_TURNSTILE_SITE_KEY;
const MAX_PASSWORD_LENGTH = 30;
const USERNAME_REGEX = /^[a-zA-Z0-9]{3,16}$/;

export default function Register() {
  const [step, setStep] = useState(1); // 1: form đăng ký, 2: nhập OTP
  const [form, setForm] = useState({
    username: '', password: '', confirmPassword: '', email: '', phone: ''
  });
  const [turnstileToken, setTurnstileToken] = useState('');
  // Đổi key mỗi lần gửi để buộc Turnstile render lại — token chỉ dùng được 1 lần.
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  // Chỉ bật cảnh báo CAPTCHA sau khi user bấm nút mà chưa xác thực, không hiện sẵn ngay khi vào trang.
  const [captchaWarning, setCaptchaWarning] = useState(false);
  const [otp, setOtp]               = useState('');
  const [error, showError]          = useTimedMessage();
  // Lỗi gắn theo ô cụ thể (username/email trùng, kể cả race condition) — khác `error` (banner chung).
  const [fieldErrors, setFieldErrors] = useState({ username: '', email: '' });
  const [loading, setLoading]       = useState(false);
  const [countdown, setCountdown]   = useState(0); // đếm ngược 5 phút
  const navigate                    = useNavigate();

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const formatCountdown = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleSendOTP = async (e) => {
    e.preventDefault();
    showError('');
    setFieldErrors({ username: '', email: '' });

    if (form.password.length < 8 || form.password.length > MAX_PASSWORD_LENGTH) {
      showError(`Mật khẩu phải có từ 8-${MAX_PASSWORD_LENGTH} ký tự`); return;
    }
    if (form.password !== form.confirmPassword) {
      showError('Mật khẩu xác nhận không khớp'); return;
    }
    if (!USERNAME_REGEX.test(form.username)) {
      showError('Tài khoản chỉ được chứa chữ cái và số, không kí tự đặc biệt, độ dài 3-16 kí tự'); return;
    }
    if (turnstileEnabled && !turnstileToken) {
      setCaptchaWarning(true); return;
    }

    setLoading(true);
    try {
      await sendOtp({
        username: form.username,
        password: form.password,
        email:    form.email,
        phone:    form.phone,
        turnstileToken,
      });
      setStep(2);
      setCountdown(300); // 5 phút
    } catch (err) {
      const { field, message } = err.response?.data || {};
      if (field === 'username' || field === 'email') {
        setFieldErrors(prev => ({ ...prev, [field]: message }));
      } else {
        showError(message || 'Gửi OTP thất bại');
      }
    } finally {
      setLoading(false);
      setTurnstileResetKey(k => k + 1);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    showError('');
    if (otp.length !== 6) {
      showError('OTP phải có 6 chữ số'); return;
    }
    setLoading(true);
    try {
      await verifyOtp({
        email: form.email,
        otp,
      });
      navigate('/set-nickname', { state: { password: form.password } });
    } catch (err) {
      const { field, message } = err.response?.data || {};
      if (field === 'username' || field === 'email') {
        // Race condition: username/email vừa bị chiếm khi đang chờ OTP — quay lại bước 1 sửa ô gây lỗi.
        setOtp('');
        setCountdown(0);
        setFieldErrors(prev => ({ ...prev, [field]: message }));
        setStep(1);
      } else {
        showError(message || 'Xác thực OTP thất bại');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (turnstileEnabled && !turnstileToken) {
      setCaptchaWarning(true); return;
    }
    showError('');
    setOtp('');
    setLoading(true);
    try {
      await sendOtp({
        username: form.username,
        password: form.password,
        email:    form.email,
        phone:    form.phone,
        turnstileToken,
      });
      setCountdown(300);
    } catch (err) {
      const { field, message } = err.response?.data || {};
      if (field === 'username' || field === 'email') {
        setOtp('');
        setCountdown(0);
        setFieldErrors(prev => ({ ...prev, [field]: message }));
        setStep(1);
      } else {
        showError(message || 'Gửi lại OTP thất bại');
      }
    } finally {
      setLoading(false);
      setTurnstileResetKey(k => k + 1);
    }
  };

  // ── Giao diện bước 1: Form đăng ký ──
  if (step === 1) {
    return (
    <div data-theme="aurora" className="min-h-[100dvh] flex items-center justify-center bg-base-200 px-4 py-8">
        <div className="card w-full max-w-lg bg-base-100 shadow-2xl border border-base-300/50">
          <div className="card-body p-8">
            <h1 className="text-3xl font-bold text-center text-primary mb-2">Đăng ký</h1>
            
            <ul className="steps w-full my-6 text-sm">
              <li className="step step-primary font-semibold">Tài khoản</li>
              <li className="step">Xác thực</li>
            </ul>

            <Toast message={error} type="error" variant="banner" alertClassName="shadow-sm py-3 mb-4 rounded-lg text-sm font-medium" />

            <form onSubmit={handleSendOTP} className="flex flex-col gap-4">
              <div className="form-control">
                <label className="label">
                  <span className="label-text font-semibold text-base-content/80">Tên tài khoản</span>
                </label>
                <input
                  className="input input-bordered focus:input-primary w-full transition-all duration-200"
                  placeholder="Nhập tên tài khoản (3 - 16 ký tự)..."
                  value={form.username}
                  onChange={e => {
                    setForm({ ...form, username: e.target.value });
                    if (fieldErrors.username) setFieldErrors(prev => ({ ...prev, username: '' }));
                  }}
                  required minLength={3} maxLength={16}
                />
                {fieldErrors.username && (
                  <span className="text-xs text-error flex items-center gap-1 mt-1">{fieldErrors.username}</span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text font-semibold text-base-content/80">Mật khẩu</span>
                  </label>
                  <PasswordInput
                    className="input input-bordered focus:input-primary w-full transition-all duration-200"
                    placeholder={`8-${MAX_PASSWORD_LENGTH} ký tự...`}
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && form.password.length >= MAX_PASSWORD_LENGTH) {
                        showError(`Mật khẩu không được vượt quá ${MAX_PASSWORD_LENGTH} ký tự`);
                      }
                    }}
                    required minLength={8} maxLength={MAX_PASSWORD_LENGTH}
                  />
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text font-semibold text-base-content/80">Xác nhận mật khẩu</span>
                  </label>
                  <PasswordInput
                    className="input input-bordered focus:input-primary w-full transition-all duration-200"
                    placeholder="Nhập lại mật khẩu..."
                    value={form.confirmPassword}
                    onChange={e => setForm({ ...form, confirmPassword: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text font-semibold text-base-content/80">Email</span>
                </label>
                <input
                  type="email"
                  className="input input-bordered focus:input-primary w-full transition-all duration-200"
                  placeholder="name@example.com"
                  value={form.email}
                  onChange={e => {
                    setForm({ ...form, email: e.target.value });
                    if (fieldErrors.email) setFieldErrors(prev => ({ ...prev, email: '' }));
                  }}
                  required
                />
                {fieldErrors.email && (
                  <span className="text-xs text-error flex items-center gap-1 mt-1">{fieldErrors.email}</span>
                )}
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text font-semibold text-base-content/80">Số điện thoại (tùy chọn)</span>
                </label>
                <input
                  className="input input-bordered focus:input-primary w-full transition-all duration-200"
                  placeholder="Nhập số điện thoại..."
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                />
              </div>

              <Turnstile key={turnstileResetKey} onVerify={(token) => { setTurnstileToken(token); setCaptchaWarning(false); }} />
              {captchaWarning && (
                <span className="text-xs text-error flex items-center justify-center gap-1">Vui lòng xác thực CAPTCHA trước khi tiếp tục</span>
              )}

              <button
                type="submit"
                className="btn btn-primary w-full mt-4 font-bold shadow-md shadow-primary/25 hover:shadow-lg transition-all duration-200"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Spinner size="sm" />
                    Đang gửi OTP...
                  </>
                ) : 'Tiếp theo →'}
              </button>
            </form>
            
            <div className="text-center mt-6 text-sm text-base-content/60">
              Đã có tài khoản?{' '}
              <Link to="/login" className="link link-primary link-hover font-semibold">
                Đăng nhập
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Giao diện bước 2: Nhập OTP ──
  return (
    <div data-theme="aurora" className="min-h-[100dvh] flex items-center justify-center bg-base-200 px-4">
      <div className="card w-full max-w-md bg-base-100 shadow-2xl border border-base-300/50">
        <div className="card-body p-8">
          <h1 className="text-3xl font-bold text-center text-primary mb-2">Đăng ký</h1>
          
          <ul className="steps w-full my-6 text-sm">
            <li className="step step-primary">Tài khoản</li>
            <li className="step step-primary font-semibold">Xác thực</li>
          </ul>

          <p className="text-sm text-center text-base-content/75 mb-4">
            Mã OTP đã được gửi tới <strong className="text-base-content">{form.email}</strong>
          </p>

          <div className="flex justify-center mb-6">
            {countdown > 0 ? (
              <div className="alert alert-info py-2 px-4 shadow-sm w-auto rounded-full text-xs font-semibold">
                <span>Mã hết hạn sau: {formatCountdown(countdown)}</span>
              </div>
            ) : (
              <div className="alert alert-error py-2 px-4 shadow-sm w-auto rounded-full text-xs font-semibold">
                <span>Mã OTP đã hết hạn</span>
              </div>
            )}
          </div>

          {error && (
            <div className="alert alert-error shadow-sm py-3 mb-4 rounded-lg">
              <span className="text-sm font-medium">{error}</span>
            </div>
          )}

          <form onSubmit={handleVerifyOTP} className="flex flex-col gap-4">
            <div className="form-control flex justify-center">
              <OtpInput value={otp} onChange={setOtp} className="otp-primary" required />
            </div>

            <button
              type="submit"
              className="btn btn-primary w-full mt-2 font-bold shadow-md shadow-primary/25 hover:shadow-lg transition-all duration-200"
              disabled={loading || countdown === 0 || otp.length !== 6}
            >
              {loading ? (
                <>
                  <Spinner size="sm" />
                  Đang xác thực...
                </>
              ) : 'Xác nhận'}
            </button>
          </form>

          {countdown === 0 && (
            <div className="mb-3">
              <Turnstile key={turnstileResetKey} onVerify={(token) => { setTurnstileToken(token); setCaptchaWarning(false); }} />
              {captchaWarning && (
                <span className="text-xs text-error flex items-center justify-center gap-1 mt-1">Vui lòng xác thực CAPTCHA trước khi gửi lại</span>
              )}
            </div>
          )}

          <div className="flex justify-between items-center mt-6 text-sm">
            <Button
              onClick={() => { setStep(1); showError(''); setOtp(''); setCaptchaWarning(false); }}
              size="sm" className="!text-primary font-semibold"
            >
              ← Quay lại
            </Button>
            <Button
              onClick={handleResendOTP}
              disabled={loading || countdown > 0}
              size="sm" className={`font-semibold ${countdown > 0 ? '!text-base-content/30' : '!text-primary'}`}
            >
              Gửi lại OTP
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
