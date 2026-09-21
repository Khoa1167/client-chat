import { useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../common/toastStore';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Spinner from '../common/Spinner';
import useChatBackup from '../../hooks/useChatBackup';
import { downloadBlob } from '../../utils/attachmentDecrypt';

const MIN_PASSPHRASE_LENGTH = 8;

function ExportModal({ onClose }) {
  const { user } = useAuth();
  const { progress, exportBackup } = useChatBackup(user);
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = passphrase.length >= MIN_PASSPHRASE_LENGTH && passphrase === confirmPassphrase && agreed && !loading;

  const handleExport = async () => {
    setError('');
    setLoading(true);
    try {
      const { envelope, messageCount, skippedCount } = await exportBackup(passphrase);
      const blob = new Blob([JSON.stringify(envelope)], { type: 'application/json' });
      downloadBlob(blob, `chat-backup-${new Date().toISOString().slice(0, 10)}.json`);
      toast.success(
        skippedCount > 0
          ? `Đã xuất ${messageCount} tin nhắn (bỏ qua ${skippedCount} đính kèm đã hết hạn)`
          : `Đã xuất ${messageCount} tin nhắn`
      );
      onClose();
    } catch (err) {
      console.error('[Backup] Export error:', err);
      setError('Không thể xuất dữ liệu, thử lại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal onClose={loading ? undefined : onClose}>
      <h3 className="text-base font-bold mb-3">Xuất dữ liệu chat</h3>
      <div className="text-xs text-base-content/70 space-y-2 mb-4">
        <p>Toàn bộ lịch sử chat trên thiết bị này (kèm ảnh/tệp/audio) sẽ được mã hóa bằng passphrase bạn đặt bên dưới rồi tải về máy.</p>
        <p className="text-warning font-semibold">Mất passphrase này = mất khả năng khôi phục vĩnh viễn, kể cả chính bạn. Không chia sẻ tệp backup cho ai.</p>
      </div>

      {loading ? (
        <div className="flex flex-col items-center gap-2 py-6">
          <Spinner size="md" />
          <span className="text-xs text-base-content/60">
            Đang xử lý{progress ? ` ${progress.processed} tin nhắn` : ''}...
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <input
            type="password"
            placeholder="Đặt passphrase (tối thiểu 8 ký tự)"
            value={passphrase}
            onChange={e => setPassphrase(e.target.value)}
            className="input input-sm input-bordered w-full"
          />
          <input
            type="password"
            placeholder="Nhập lại passphrase"
            value={confirmPassphrase}
            onChange={e => setConfirmPassphrase(e.target.value)}
            className="input input-sm input-bordered w-full"
          />
          <label className="flex items-start gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="checkbox checkbox-xs mt-0.5" />
            Tôi hiểu rằng mất passphrase này sẽ không thể khôi phục lại dữ liệu.
          </label>
          {error && <span className="text-xs text-error">{error}</span>}
        </div>
      )}

      <div className="flex justify-end gap-2 mt-4">
        <Button onClick={onClose} size="sm" disabled={loading}>Hủy</Button>
        <Button onClick={handleExport} variant="primary" size="sm" disabled={!canSubmit}>Xuất</Button>
      </div>
    </Modal>
  );
}

function RestoreModal({ onClose }) {
  const { user } = useAuth();
  const { progress, restoreBackup } = useChatBackup(user);
  const [envelope, setEnvelope] = useState(null);
  const [fileName, setFileName] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed?.magic !== 'CHATAPP_BACKUP') throw new Error('invalid');
      setEnvelope(parsed);
      setFileName(file.name);
    } catch {
      setError('Tệp không hợp lệ hoặc không phải tệp sao lưu');
      setEnvelope(null);
      setFileName('');
    }
  };

  const handleRestore = async () => {
    setError('');
    setLoading(true);
    try {
      const { messageCount, roomCount } = await restoreBackup(envelope, passphrase);
      toast.success(`Đã khôi phục ${messageCount} tin nhắn từ ${roomCount} cuộc trò chuyện`);
      onClose();
    } catch (err) {
      console.error('[Backup] Restore error:', err);
      setError(err.message || 'Không thể khôi phục dữ liệu');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal onClose={loading ? undefined : onClose}>
      <h3 className="text-base font-bold mb-3">Khôi phục dữ liệu chat</h3>
      <p className="text-xs text-base-content/70 mb-4">
        Chọn tệp sao lưu đã mã hóa và nhập đúng passphrase lúc xuất. Tin nhắn khôi phục sẽ gộp vào lịch sử hiện có, không ghi đè tin mới hơn.
      </p>

      {loading ? (
        <div className="flex flex-col items-center gap-2 py-6">
          <Spinner size="md" />
          <span className="text-xs text-base-content/60">
            Đang khôi phục{progress ? ` ${progress.processed} tin nhắn` : ''}...
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <input ref={fileInputRef} type="file" accept="application/json" onChange={handleFileChange} className="file-input file-input-sm file-input-bordered w-full" />
          {envelope && (
            <div className="text-xs text-base-content/60">
              Tệp: {fileName} — Xuất lúc {new Date(envelope.exportedAt).toLocaleString('vi-VN')}
            </div>
          )}
          <input
            type="password"
            placeholder="Passphrase"
            value={passphrase}
            onChange={e => setPassphrase(e.target.value)}
            className="input input-sm input-bordered w-full"
            disabled={!envelope}
          />
          {error && <span className="text-xs text-error">{error}</span>}
        </div>
      )}

      <div className="flex justify-end gap-2 mt-4">
        <Button onClick={onClose} size="sm" disabled={loading}>Hủy</Button>
        <Button onClick={handleRestore} variant="primary" size="sm" disabled={!envelope || !passphrase || loading}>Khôi phục</Button>
      </div>
    </Modal>
  );
}

export default function BackupRestoreSection() {
  const [modal, setModal] = useState(null);

  return (
    <div className="mt-4 pt-4 border-t border-base-300 flex flex-col gap-2">
      <span className="font-semibold text-xs">Sao lưu & Khôi phục</span>
      <span className="text-base-content/50 text-xs">
        Xuất lịch sử chat trên thiết bị này ra tệp mã hóa để phòng khi cài lại máy hoặc xóa dữ liệu trình duyệt.
      </span>
      <div className="flex gap-2 mt-1">
        <Button onClick={() => setModal('export')} size="sm" className="flex-1">Xuất dữ liệu</Button>
        <Button onClick={() => setModal('restore')} size="sm" className="flex-1">Khôi phục dữ liệu</Button>
      </div>

      {modal === 'export' && <ExportModal onClose={() => setModal(null)} />}
      {modal === 'restore' && <RestoreModal onClose={() => setModal(null)} />}
    </div>
  );
}
