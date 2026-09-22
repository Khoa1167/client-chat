import { useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import OtpInput from '../common/OtpInput';
import { requestAccountRecovery, verifyAccountRecovery } from '../../api/auth.api';

export default function AccountRecoveryModal({ onClose }) {
  const [step, setStep] = useState('email'); // 'email' | 'otp' | 'done'
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await requestAccountRecovery(email);
      setStep('otp');
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể gửi mã khôi phục');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await verifyAccountRecovery(email, otp);
      setStep('done');
    } catch (err) {
      setError(err.response?.data?.message || 'Mã OTP không chính xác');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal onClose={onClose} boxClassName="max-w-sm bg-base-100 border border-base-300 shadow-2xl">
      {step === 'email' && (
        <form onSubmit={handleRequestOtp} className="flex flex-col gap-3">
          <h3 className="text-base font-bold">Khôi phục tài khoản</h3>
          <p className="text-xs text-base-content/60">Nhập email tài khoản để nhận mã khôi phục.</p>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="input input-sm input-bordered w-full"
            placeholder="Email"
          />
          {error && <span className="text-xs text-error">{error}</span>}
          <Button type="submit" variant="primary" size="sm" disabled={loading}>Gửi mã</Button>
        </form>
      )}
      {step === 'otp' && (
        <form onSubmit={handleVerify} className="flex flex-col gap-3 items-center">
          <h3 className="text-base font-bold self-start">Nhập mã khôi phục</h3>
          <p className="text-xs text-base-content/60 self-start">Mã 6 số đã gửi tới {email}.</p>
          <OtpInput value={otp} onChange={setOtp} />
          {error && <span className="text-xs text-error self-start">{error}</span>}
          <Button type="submit" variant="primary" size="sm" disabled={loading || otp.length !== 6}>Xác nhận</Button>
        </form>
      )}
      {step === 'done' && (
        <div className="flex flex-col gap-3 items-center text-center">
          <p className="text-sm font-semibold">Đã khôi phục tài khoản!</p>
          <p className="text-xs text-base-content/60">Hãy đăng nhập lại bình thường.</p>
          <Button onClick={onClose} variant="primary" size="sm">Đóng</Button>
        </div>
      )}
    </Modal>
  );
}
