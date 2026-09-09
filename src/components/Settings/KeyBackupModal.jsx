import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Toast from '../common/Toast';
import PasswordInput from '../common/PasswordInput';
import Tabs from '../common/Tabs';
import useTimedMessage from '../../hooks/useTimedMessage';
import { beginPasskeyStepUp, getHistoryBackup, getMfaStatus, saveHistoryBackup, verifyPasskeyStepUp } from '../../api/auth.api';
import { createEncryptedHistoryBackup, generateHistoryRecoveryKey, restoreEncryptedHistoryBackup } from '../../crypto';

export default function KeyBackupModal({ onClose }) {
  const [activeTab, setActiveTab] = useState('backup');
  const [status, setStatus] = useState(null);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [stepUpChallengeToken, setStepUpChallengeToken] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [recoveryKeySaved, setRecoveryKeySaved] = useState(false);
  const [restoreKey, setRestoreKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, showError] = useTimedMessage();
  const [success, showSuccess] = useTimedMessage();

  useEffect(() => { getMfaStatus().then(setStatus).catch(() => showError('Không thể kiểm tra trạng thái bảo mật.')); }, [showError]);
  const needsSecondFactor = status?.totpEnabled || status?.passkeyCount > 0;
  const clearMessages = () => { showError(''); showSuccess(''); };

  const handlePasskeyStepUp = async () => {
    clearMessages(); setLoading(true);
    try {
      const { challengeToken, options } = await beginPasskeyStepUp();
      const { startAuthentication } = await import('@simplewebauthn/browser');
      const assertion = await startAuthentication(options);
      const result = await verifyPasskeyStepUp(challengeToken, assertion);
      setStepUpChallengeToken(result.challengeToken);
      showSuccess('Đã xác nhận bằng Passkey. Tiếp tục lưu bản sao lưu.');
    } catch (err) { showError(err.response?.data?.message || err.message || 'Xác thực Passkey thất bại.'); }
    finally { setLoading(false); }
  };

  const generateRecoveryKey = () => { setRecoveryKey(generateHistoryRecoveryKey()); setRecoveryKeySaved(false); clearMessages(); };

  const handleBackup = async (event) => {
    event.preventDefault(); clearMessages();
    if (!recoveryKey || !recoveryKeySaved) return showError('Hãy lưu mã khôi phục trước khi tiếp tục.');
    if (!password) return showError('Vui lòng nhập mật khẩu hiện tại.');
    if (needsSecondFactor && !code && !stepUpChallengeToken) return showError('Hãy nhập mã xác thực hoặc xác nhận bằng Passkey.');
    setLoading(true);
    try {
      const backup = await createEncryptedHistoryBackup(recoveryKey);
      await saveHistoryBackup({ ...backup, currentPassword: password, currentCode: code, stepUpChallengeToken });
      setPassword(''); setCode(''); setStepUpChallengeToken('');
      showSuccess('Đã lưu lịch sử được mã hóa. Server không có mã khôi phục.');
    } catch (err) { showError(err.response?.data?.message || err.message || 'Không thể lưu bản sao lưu.'); }
    finally { setLoading(false); }
  };

  const handleRestore = async (event) => {
    event.preventDefault(); clearMessages();
    if (!restoreKey.trim()) return showError('Vui lòng nhập mã khôi phục.');
    setLoading(true);
    try {
      const backup = await getHistoryBackup();
      const keyCount = await restoreEncryptedHistoryBackup(backup, restoreKey);
      showSuccess(`Đã khôi phục ${keyCount} khóa lịch sử. Tin nhắn mới vẫn dùng khóa thiết bị hiện tại.`);
    } catch (err) { showError(err.response?.data?.message || err.message || 'Không thể khôi phục lịch sử.'); }
    finally { setLoading(false); }
  };

  return (
    <Modal onClose={onClose} boxClassName="max-w-md bg-base-100 border border-base-300 shadow-2xl">
      <div className="flex items-center justify-between border-b border-base-300 pb-3 mb-4">
        <h3 className="text-base font-bold">Sao lưu lịch sử E2EE</h3>
        <Button onClick={onClose} size="sm" circle aria-label="Đóng">✕</Button>
      </div>
      <Tabs className="mb-4" tabClassName="flex-1 font-bold" active={activeTab} onChange={key => { setActiveTab(key); clearMessages(); }} tabs={[{ key: 'backup', label: 'Sao lưu' }, { key: 'restore', label: 'Khôi phục' }]} />
      <Toast message={error} type="error" variant="banner" alertClassName="py-2 px-3 text-xs font-semibold rounded-xl mb-4" />
      <Toast message={success} type="success" variant="banner" alertClassName="py-2 px-3 text-xs font-semibold rounded-xl mb-4" />
      {activeTab === 'backup' ? <form onSubmit={handleBackup} className="flex flex-col gap-3">
        <p className="text-xs text-base-content/65">Chỉ khóa mã hóa được đưa vào bản sao lưu. Tin nhắn và mã khôi phục không được gửi lên server.</p>
        {!recoveryKey ? <Button variant="primary" size="sm" onClick={generateRecoveryKey}>Tạo mã khôi phục</Button> : <>
          <label className="text-xs font-bold">Mã khôi phục — chỉ hiện tại đây</label>
          <textarea readOnly rows={3} value={recoveryKey} className="textarea textarea-bordered bg-base-200 font-mono text-xs select-all" />
          <label className="label cursor-pointer justify-start gap-2 text-xs"><input type="checkbox" className="checkbox checkbox-sm" checked={recoveryKeySaved} onChange={e => setRecoveryKeySaved(e.target.checked)} /> Tôi đã lưu mã khôi phục ở nơi an toàn</label>
        </>}
        <PasswordInput className="input input-bordered input-sm w-full" placeholder="Mật khẩu hiện tại" value={password} onChange={e => setPassword(e.target.value)} />
        {status?.totpEnabled && <input className="input input-bordered input-sm w-full" inputMode="numeric" placeholder="Mã Authenticator hoặc mã khôi phục" value={code} onChange={e => setCode(e.target.value)} />}
        {status?.passkeyCount > 0 && <Button size="sm" onClick={handlePasskeyStepUp} disabled={loading}>{stepUpChallengeToken ? 'Passkey đã xác nhận' : 'Xác nhận bằng Passkey'}</Button>}
        <Button type="submit" variant="success" size="sm" disabled={loading || !recoveryKeySaved}>{loading ? 'Đang lưu...' : 'Lưu bản sao lưu mã hóa'}</Button>
      </form> : <form onSubmit={handleRestore} className="flex flex-col gap-3">
        <p className="text-xs text-base-content/65">Khôi phục chỉ thêm khóa đọc lịch sử; không thay khóa dùng cho tin nhắn mới.</p>
        <textarea rows={3} className="textarea textarea-bordered font-mono text-xs" placeholder="Dán mã khôi phục" value={restoreKey} onChange={e => setRestoreKey(e.target.value)} />
        <Button type="submit" variant="success" size="sm" disabled={loading}>{loading ? 'Đang khôi phục...' : 'Khôi phục lịch sử'}</Button>
      </form>}
    </Modal>
  );
}
