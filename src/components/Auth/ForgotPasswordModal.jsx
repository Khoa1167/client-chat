import { useState, useEffect } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { forgotPassword, verifyResetOtp, resetPassword } from '../../api/auth.api';
import Turnstile from '../common/Turnstile';
import Button from '../common/Button';
import Toast from '../common/Toast';
import PasswordInput from '../common/PasswordInput';
import FieldHint from '../common/FieldHint';
import OtpInput from '../common/OtpInput';
import Spinner from '../common/Spinner';
import useTimedMessage from '../../hooks/useTimedMessage';

const turnstileEnabled = !!import.meta.env.VITE_CLOUDFLARE_TURNSTILE_SITE_KEY;
const MAX_PASSWORD_LENGTH = 30;

export default function ForgotPasswordModal({ isOpen, onClose, onSuccess }) {
  const [step, setStep]                 = useState(1); // 1: Email, 2: OTP, 3: New Password
  const [email, setEmail]               = useState('');
  const [otp, setOtp]                   = useState('');
  const [resetToken, setResetToken]     = useState('');
  const [newPassword, setNewPassword]   = useState('');
  const [confirmPw, setConfirmPw]       = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  // Đổi sau mỗi lần gửi để buộc Turnstile render lại — token chỉ dùng được 1 lần
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  // Chỉ bật cảnh báo CAPTCHA sau khi người dùng thực sự bấm nút mà chưa xác thực xong.
  const [captchaWarning, setCaptchaWarning] = useState(false);

  const [error, showError]              = useTimedMessage();
  const [successMsg, showSuccessMsg]    = useTimedMessage();
  const [loading, setLoading]           = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  if (!isOpen) return null;

  const handleClose = () => {
    setStep(1);
    setEmail('');
    setOtp('');
    setResetToken('');
    setNewPassword('');
    setConfirmPw('');
    showError('');
    showSuccessMsg('');
    setTurnstileToken('');
    setCaptchaWarning(false);
    onClose();
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!email.trim()) return showError('Vui lòng nhập email');
    if (turnstileEnabled && !turnstileToken) {
      setCaptchaWarning(true); return;
    }

    showError('');
    showSuccessMsg('');
    setLoading(true);

    try {
      const res = await forgotPassword(email, turnstileToken);
      showSuccessMsg(res.message || 'Mã OTP đã được gửi đến email của bạn');
      setStep(2);
      setResendCooldown(60);
    } catch (err) {
      showError(err.response?.data?.message || 'Gửi OTP thất bại, vui lòng thử lại');
    } finally {
      setLoading(false);
      setTurnstileResetKey(k => k + 1);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otp.trim()) return showError('Vui lòng nhập mã OTP');

    showError('');
    showSuccessMsg('');
    setLoading(true);

    try {
      const res = await verifyResetOtp(email, otp);
      setResetToken(res.resetToken);
      showSuccessMsg('Xác thực OTP thành công! Vui lòng nhập mật khẩu mới.');
      setStep(3);
    } catch (err) {
      showError(err.response?.data?.message || 'Xác thực OTP thất bại');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8 || newPassword.length > MAX_PASSWORD_LENGTH) {
      return showError(`Mật khẩu mới phải có từ 8-${MAX_PASSWORD_LENGTH} ký tự`);
    }
    if (newPassword !== confirmPw) {
      return showError('Mật khẩu xác nhận không trùng khớp');
    }

    showError('');
    showSuccessMsg('');
    setLoading(true);

    try {
      const res = await resetPassword({
        email,
        resetToken,
        newPassword,
      });
      showSuccessMsg(res.message || 'Đổi mật khẩu thành công!');
      setTimeout(() => {
        if (onSuccess) onSuccess();
        handleClose();
      }, 1500);
    } catch (err) {
      showError(err.response?.data?.message || 'Đổi mật khẩu thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal modal-open bg-black/50 backdrop-blur-sm z-50">
      <div className="modal-box relative max-w-md bg-base-100 p-6 rounded-2xl shadow-2xl border border-base-300">
        <Button onClick={handleClose} size="sm" circle className="absolute right-4 top-4" aria-label="Đóng">
          <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.8} />
        </Button>

        <h3 className="text-xl font-bold text-center text-primary mb-1">
          {step === 1 && 'Khôi phục mật khẩu'}
          {step === 2 && 'Xác thực mã OTP'}
          {step === 3 && 'Đặt mật khẩu mới'}
        </h3>

        <p className="text-xs text-center text-base-content/60 mb-5">
          {step === 1 && 'Nhập email tài khoản của bạn để nhận mã xác nhận'}
          {step === 2 && `Mã OTP đã gửi tới ${email}`}
          {step === 3 && 'Tạo mật khẩu mới an toàn cho tài khoản của bạn'}
        </p>

        <Toast message={error} type="error" variant="banner" alertClassName="text-xs mb-4 rounded-lg" />
        <Toast message={successMsg} type="success" variant="banner" alertClassName="text-xs mb-4 rounded-lg" />

        {/* BƯỚC 1: NHẬP EMAIL */}
        {step === 1 && (
          <form onSubmit={handleSendOtp} className="flex flex-col gap-4">
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text font-semibold text-xs text-base-content/80">
                  Địa chỉ Email đăng ký
                </span>
              </label>
              <input
                type="email"
                className="input input-bordered focus:input-primary w-full text-sm"
                placeholder="example@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <Turnstile key={turnstileResetKey} onVerify={(token) => { setTurnstileToken(token); setCaptchaWarning(false); }} />
            {captchaWarning && (
              <span className="text-xs text-error flex items-center justify-center gap-1">Vui lòng xác thực CAPTCHA trước khi tiếp tục</span>
            )}

            <button
              type="submit"
              className="btn btn-primary w-full mt-2 font-bold shadow-md shadow-primary/25"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Spinner size="xs" />
                  Đang gửi mã...
                </>
              ) : (
                'Gửi mã xác nhận'
              )}
            </button>
          </form>
        )}

        {/* BƯỚC 2: NHẬP OTP */}
        {step === 2 && (
          <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4">
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text font-semibold text-xs text-base-content/80">
                  Mã OTP (6 chữ số)
                </span>
              </label>
              <div className="flex justify-center">
                <OtpInput value={otp} onChange={setOtp} className="otp-primary" required />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary w-full font-bold shadow-md shadow-primary/25"
              disabled={loading || otp.length !== 6}
            >
              {loading ? (
                <>
                  <Spinner size="xs" />
                  Đang xác thực...
                </>
              ) : (
                'Xác nhận OTP'
              )}
            </button>

            {resendCooldown === 0 && (
              <div>
                <Turnstile key={turnstileResetKey} onVerify={(token) => { setTurnstileToken(token); setCaptchaWarning(false); }} />
                {captchaWarning && (
                  <span className="text-xs text-error flex items-center justify-center gap-1 mt-1">Vui lòng xác thực CAPTCHA trước khi gửi lại</span>
                )}
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-base-content/60 mt-2">
              <button
                type="button"
                onClick={() => { setStep(1); setCaptchaWarning(false); }}
                className="link link-hover text-primary"
              >
                ← Đổi email
              </button>
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={resendCooldown > 0 || loading}
                className="link link-hover text-primary disabled:text-base-content/40 disabled:no-underline"
              >
                {resendCooldown > 0
                  ? `Gửi lại mã (${resendCooldown}s)`
                  : 'Gửi lại mã OTP'}
              </button>
            </div>
          </form>
        )}

        {/* BƯỚC 3: ĐẶT MẬT KHẨU MỚI */}
        {step === 3 && (
          <form onSubmit={handleResetPassword} className="flex flex-col gap-4">
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text font-semibold text-xs text-base-content/80">
                  Mật khẩu mới
                </span>
              </label>
              <FieldHint hint={`Mật khẩu dài 8-${MAX_PASSWORD_LENGTH} ký tự`}>
                <PasswordInput
                  className="input input-bordered focus:input-primary w-full text-sm"
                  placeholder={`8-${MAX_PASSWORD_LENGTH} ký tự...`}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && newPassword.length >= MAX_PASSWORD_LENGTH) {
                      showError(`Mật khẩu không được vượt quá ${MAX_PASSWORD_LENGTH} ký tự`);
                    }
                  }}
                  required minLength={8} maxLength={MAX_PASSWORD_LENGTH}
                />
              </FieldHint>
            </div>

            <div className="form-control">
              <label className="label py-1">
                <span className="label-text font-semibold text-xs text-base-content/80">
                  Xác nhận mật khẩu mới
                </span>
              </label>
              <PasswordInput
                className="input input-bordered focus:input-primary w-full text-sm"
                placeholder="Nhập lại mật khẩu mới..."
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary w-full mt-2 font-bold shadow-md shadow-primary/25"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Spinner size="xs" />
                  Đang cập nhật...
                </>
              ) : (
                'Hoàn tất & Đổi mật khẩu'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
