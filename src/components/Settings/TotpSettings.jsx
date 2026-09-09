import { useEffect, useState } from 'react';
import Button from '../common/Button';
import Modal from '../common/Modal';
import OtpInput from '../common/OtpInput';
import PasswordInput from '../common/PasswordInput';
import Toast from '../common/Toast';
import { useAuth } from '../../context/AuthContext';
import {
  beginTotpSetup,
  confirmTotpSetup,
  disableTotp,
  regenerateTotpRecoveryCodes,
  beginPasskeyStepUp,
  verifyPasskeyStepUp,
  getPasskeyRegisterOptions,
  verifyPasskeyRegistration,
  getMfaStatus,
  listPasskeys,
} from '../../api/auth.api';

const ACTION_LABELS = {
  setup: 'Bật xác thực hai bước',
  change: 'Đổi ứng dụng Authenticator',
  recovery: 'Tạo lại mã khôi phục',
  disable: 'Tắt xác thực hai bước',
  passkey: 'Thêm Passkey',
};

export default function TotpSettings() {
  const { user, setUser } = useAuth();
  const [action, setAction] = useState('');
  const [step, setStep] = useState('authorize');
  const [form, setForm] = useState({ currentPassword: '', currentCode: '', newCode: '' });
  const [setup, setSetup] = useState(null);
  const [qrCode, setQrCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passkeys, setPasskeys] = useState([]);
  const [mfaStatus, setMfaStatus] = useState({ totpEnabled: user.totpEnabled, passkeyCount: 0 });
  const [showManualKey, setShowManualKey] = useState(false);

  const reloadPasskeys = async () => {
    const [credentials, status] = await Promise.all([listPasskeys(), getMfaStatus()]);
    setPasskeys(credentials);
    setMfaStatus(status);
  };

  useEffect(() => { reloadPasskeys().catch(() => {}); }, []);

  const close = () => {
    setAction('');
    setStep('authorize');
    setForm({ currentPassword: '', currentCode: '', newCode: '' });
    setSetup(null);
    setQrCode('');
    setRecoveryCodes([]);
    setShowManualKey(false);
    setError('');
  };

  const open = (nextAction) => {
    close();
    setAction(nextAction);
  };

  const handleAuthorize = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const passkeyOnlyProof = async () => {
        const stepUp = await beginPasskeyStepUp();
        const { startAuthentication } = await import('@simplewebauthn/browser');
        const assertion = await startAuthentication({ optionsJSON: stepUp.options });
        const verified = await verifyPasskeyStepUp(stepUp.challengeToken, assertion);
        return { currentPassword: form.currentPassword, stepUpChallengeToken: verified.challengeToken };
      };
      if (action === 'passkey') {
        let proof = { currentPassword: form.currentPassword, currentCode: form.currentCode };
        if (!mfaStatus.totpEnabled && mfaStatus.passkeyCount) {
          proof = await passkeyOnlyProof();
        }
        const registration = await getPasskeyRegisterOptions(proof);
        const { startRegistration } = await import('@simplewebauthn/browser');
        const response = await startRegistration({ optionsJSON: registration.options });
        const data = await verifyPasskeyRegistration({ challengeToken: registration.challengeToken, registrationBody: response });
        await reloadPasskeys();
        if (data.recoveryCodes?.length) {
          setRecoveryCodes(data.recoveryCodes);
          setStep('recovery-codes');
        } else close();
        return;
      }
      if (action === 'setup' || action === 'change') {
        const proof = action === 'setup' && !mfaStatus.totpEnabled && mfaStatus.passkeyCount
          ? await passkeyOnlyProof()
          : {
          currentPassword: form.currentPassword,
          currentCode: action === 'change' ? form.currentCode : undefined,
          };
        const data = await beginTotpSetup(proof);
        setSetup(data);
        const { default: QRCode } = await import('qrcode');
        setQrCode(await QRCode.toDataURL(data.otpauthUri, { width: 240, margin: 1 }));
        setStep('confirm');
        return;
      }

      const payload = { currentPassword: form.currentPassword, code: form.currentCode };
      const data = action === 'disable'
        ? await disableTotp(payload)
        : await regenerateTotpRecoveryCodes(payload);
      setUser(data.user);
      if (data.recoveryCodes) {
        setRecoveryCodes(data.recoveryCodes);
        setStep('recovery-codes');
      } else {
        close();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể cập nhật xác thực hai bước');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmSetup = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await confirmTotpSetup(form.newCode);
      setUser(data.user);
      setRecoveryCodes(data.recoveryCodes);
      setStep('recovery-codes');
    } catch (err) {
      setError(err.response?.data?.message || 'Mã xác thực không đúng');
    } finally {
      setLoading(false);
    }
  };

  const copyRecoveryCodes = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'));
    } catch {
      setError('Không thể sao chép tự động. Hãy chọn và sao chép các mã bên dưới.');
    }
  };

  const copyManualKey = async () => {
    try {
      await navigator.clipboard.writeText(setup.secret);
    } catch {
      setError('Không thể sao chép tự động. Hãy sao chép khóa thủ công bên dưới.');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-base-300 bg-base-100 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-bold">Khoá mật khẩu vật lý (Passkey)</h2>
          <p className="text-xs text-base-content/55 mt-1">Dùng vân tay, khuôn mặt hoặc khoá bảo mật thay cho mã từ ứng dụng.</p>
          {passkeys.length > 0 && <p className="text-xs text-base-content/60 mt-2">{passkeys.length} Passkey đã đăng ký</p>}
        </div>
        {typeof window !== 'undefined' && window.PublicKeyCredential && <Button variant="primary" size="sm" pill className="w-full sm:w-auto" onClick={() => open('passkey')}>Thêm Passkey</Button>}
      </div>
      <div className="rounded-xl border border-base-300 bg-base-100 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-bold">Xác thực 2 lớp (2FA)</h2>
            <span className={`badge badge-sm ${user.totpEnabled ? 'badge-success text-white' : 'badge-ghost'}`}>
              {user.totpEnabled ? 'Đang bật' : 'Đang tắt'}
            </span>
          </div>
          <p className="text-xs text-base-content/55 mt-1">
            Dùng mã thay đổi mỗi 30 giây sau khi nhập đúng mật khẩu.
          </p>
        </div>
        {!user.totpEnabled && (
          <Button variant="primary" size="sm" pill className="w-full sm:w-auto" onClick={() => open('setup')}>
            Bật 2FA
          </Button>
        )}
      </div>

      {user.totpEnabled && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Button className="border border-base-300" onClick={() => open('change')}>Đổi xác thực 2 lớp</Button>
          <Button className="border border-base-300" onClick={() => open('recovery')}>Tạo mã khôi phục mới</Button>
          <Button variant="soft-error" className="sm:col-span-2" onClick={() => open('disable')}>Tắt 2FA</Button>
        </div>
      )}

      {action && (
        <Modal onClose={step === 'recovery-codes' ? undefined : close} boxClassName="max-w-md w-full bg-base-100 border border-base-300 shadow-2xl">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="font-bold">{ACTION_LABELS[action]}</h3>
            {step !== 'recovery-codes' && <Button size="sm" circle onClick={close}>✕</Button>}
          </div>
          <Toast message={error} type="error" variant="banner" alertClassName="py-2 px-3 text-xs rounded-lg mb-3" />

          {step === 'authorize' && (
            <form onSubmit={handleAuthorize} className="flex flex-col gap-3">
              <PasswordInput
                className="input input-bordered w-full"
                value={form.currentPassword}
                onChange={event => setForm(value => ({ ...value, currentPassword: event.target.value }))}
                placeholder="Mật khẩu hiện tại"
                autoFocus
                required
              />
              {(action !== 'setup' && action !== 'passkey') || (action === 'passkey' && mfaStatus.totpEnabled) ? (
                <input
                  className="input input-bordered w-full font-mono uppercase"
                  value={form.currentCode}
                  onChange={event => setForm(value => ({ ...value, currentCode: event.target.value.toUpperCase().slice(0, 19) }))}
                  placeholder="Mã Authenticator hoặc mã khôi phục"
                  autoComplete="one-time-code"
                  required
                />
              ) : null}
              <Button type="submit" variant={action === 'disable' ? 'error' : 'primary'} disabled={loading}>
                {loading ? 'Đang xác nhận...' : 'Tiếp tục'}
              </Button>
            </form>
          )}

          {step === 'confirm' && setup && (
            <form onSubmit={handleConfirmSetup} className="flex flex-col items-center gap-4">
              <p className="text-xs text-center text-base-content/60">
                Quét mã bằng ứng dụng Authenticator, sau đó nhập mã 6 số để hoàn tất.
              </p>
              {qrCode && <img src={qrCode} alt="Mã QR thiết lập Authenticator" className="w-52 max-w-full rounded-xl" />}
              <div className="w-full rounded-lg bg-base-200 p-3">
                <p className="text-[11px] text-base-content/50 mb-1">Khóa nhập thủ công</p>
                {showManualKey ? (
                  <>
                    <code className="block break-all select-all text-xs">{setup.secret}</code>
                    <Button type="button" size="sm" className="mt-2" onClick={copyManualKey}>Sao chép khóa</Button>
                  </>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <code className="text-xs tracking-widest">•••• •••• ••••</code>
                    <Button type="button" size="sm" onClick={() => setShowManualKey(true)}>Hiện khóa</Button>
                  </div>
                )}
              </div>
              <OtpInput value={form.newCode} onChange={newCode => setForm(value => ({ ...value, newCode }))} autoFocus required />
              <Button type="submit" variant="primary" className="w-full" disabled={loading || form.newCode.length !== 6}>
                {loading ? 'Đang bật...' : 'Xác nhận và bật'}
              </Button>
            </form>
          )}

          {step === 'recovery-codes' && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-base-content/70">
                Lưu các mã này ngay. Mỗi mã chỉ dùng được một lần và sẽ không hiển thị lại.
              </p>
              <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2 rounded-xl bg-base-200 p-3 font-mono text-sm select-all">
                {recoveryCodes.map(code => <code key={code}>{code}</code>)}
              </div>
              <Button onClick={copyRecoveryCodes}>Sao chép tất cả</Button>
              <Button variant="primary" onClick={close}>Tôi đã lưu mã</Button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
