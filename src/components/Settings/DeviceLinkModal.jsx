import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import Modal from '../common/Modal';
import Button from '../common/Button';
import QRScannerModal from '../Chat/QRScannerModal';
import DeviceLinkQrView from './DeviceLinkQrView';
import DeviceLinkOtpView from './DeviceLinkOtpView';
import { toast } from '../common/toastStore';
import { useSocket } from '../../hooks/useSocket';
import {
  createDeviceLinkKeyPair, exportDeviceLinkPublicKey, createEncryptedDeviceArchive, importEncryptedDeviceArchive,
} from '../../crypto';
import {
  acknowledgeDeviceLinkArchive, approveDeviceLinkByCode, approveDeviceLinkTransfer, completeDeviceLinkArchive, createDeviceLinkTransfer,
  getDeviceLinkArchive, getDeviceLinkArchivePartUploadUrl, reserveDeviceLinkArchive,
} from '../../api/auth.api';

const verificationCode = async (sessionId, publicKey) => {
  const source = `${sessionId}:${publicKey.kty}:${publicKey.crv}:${publicKey.x}:${publicKey.y}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return (new DataView(digest).getUint32(0) % 1_000_000).toString().padStart(6, '0');
};

export default function DeviceLinkModal({ user, onClose }) {
  const { on } = useSocket();
  const keyPairRef = useRef(null);
  const [flow, setFlow] = useState(null);
  const [mode, setMode] = useState(null);
  const [session, setSession] = useState(null);
  const [qr, setQr] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [enteredCode, setEnteredCode] = useState('');
  const [manualTransfer, setManualTransfer] = useState(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const importArchive = async (sessionId) => {
    if (!keyPairRef.current || busy) return;
    setBusy(true);
    setStatus('Đang tải và nhập lịch sử mã hóa...');
    try {
      const archive = await getDeviceLinkArchive(sessionId);
      const fetchFrom = async (offset) => {
        const current = await getDeviceLinkArchive(sessionId);
        const response = await fetch(current.downloadUrl, {
          headers: offset ? { Range: `bytes=${offset}-` } : undefined,
        });
        if (!response.ok) throw new Error('download failed');
        return response;
      };
      const count = await importEncryptedDeviceArchive(
        user._id, keyPairRef.current.privateKey, archive, sessionId, fetchFrom,
        ({ bytes, total }) => setStatus(total ? `Đang tải và nhập lịch sử mã hóa... ${Math.floor(bytes / total * 100)}%` : 'Đang tải và nhập lịch sử mã hóa...'),
      );
      acknowledgeDeviceLinkArchive(sessionId).catch(error => console.error('[Device link] Archive cleanup error:', error));
      setStatus(`Đã đồng bộ ${count} tin nhắn. Bạn có thể đóng cửa sổ này.`);
      toast.success('Đã đồng bộ lịch sử tin nhắn');
    } catch (err) {
      console.error('[Device link] Import error:', err);
      setStatus('Không thể nhập lịch sử. Hãy tạo mã QR mới và thử lại.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!session?.sessionId) return undefined;
    return on('device_link:archive_ready', ({ sessionId }) => {
      if (sessionId === session.sessionId) importArchive(sessionId);
    });
    // importArchive uses the current transient private key and is only subscribed for this modal session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.sessionId, on]);

  const createLink = async (nextMode) => {
    setBusy(true);
    try {
      const keyPair = await createDeviceLinkKeyPair();
      const publicKey = await exportDeviceLinkPublicKey(keyPair.publicKey);
      const data = await createDeviceLinkTransfer(publicKey);
      keyPairRef.current = keyPair;
      setSession(data);
      if (nextMode === 'qr') {
        const link = new URL(window.location.href);
        link.search = new URLSearchParams({ 'device-link': data.sessionId, 'device-link-key': JSON.stringify(publicKey) }).toString();
        setQr(await QRCode.toDataURL(link.toString(), { width: 220, margin: 1 }));
        setStatus('Dùng thiết bị cũ quét mã này. Mã tự hết hạn sau 10 phút.');
      } else {
        setManualCode(data.manualCode);
        setVerifyCode(await verificationCode(data.sessionId, publicKey));
        setStatus('Đưa mã OTP này cho thiết bị cũ. Mã tự hết hạn sau 10 phút.');
      }
      setMode(nextMode);
    } catch (err) {
      console.error('[Device link] Create error:', err);
      toast.error(err.response?.data?.message || 'Không thể tạo mã liên kết');
    } finally {
      setBusy(false);
    }
  };

  const copyManualCode = async () => {
    try {
      await navigator.clipboard.writeText(manualCode);
      toast.success('Đã sao chép mã OTP');
    } catch {
      toast.error('Không thể sao chép mã OTP');
    }
  };

  const approveManualCode = async (event) => {
    event.preventDefault();
    if (enteredCode.length !== 6) return;
    setBusy(true);
    try {
      const transfer = await approveDeviceLinkByCode(enteredCode);
      setManualTransfer({ ...transfer, approved: true });
      setVerifyCode(await verificationCode(transfer.sessionId, transfer.targetPublicKey));
      setMode('confirm-code');
      setStatus('Đối chiếu mã xác minh trên thiết bị mới trước khi chuyển lịch sử.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không thể liên kết thiết bị');
    } finally {
      setBusy(false);
    }
  };

  const sendArchive = async ({ sessionId, targetPublicKey: expectedPublicKey, approved = false }) => {
    setMode('sending');
    setBusy(true);
    setStatus('Đang xác nhận thiết bị mới...');
    try {
      let targetPublicKey = expectedPublicKey;
      if (!approved) {
        const response = await approveDeviceLinkTransfer(sessionId);
        targetPublicKey = response.targetPublicKey;
        if (targetPublicKey?.kty !== expectedPublicKey?.kty || targetPublicKey?.crv !== expectedPublicKey?.crv
          || targetPublicKey?.x !== expectedPublicKey?.x || targetPublicKey?.y !== expectedPublicKey?.y) {
          throw new Error('Khóa QR không khớp');
        }
      }
      setStatus('Đang mã hóa lịch sử trên thiết bị này...');
      const archive = await createEncryptedDeviceArchive(user._id, targetPublicKey, sessionId);
      await reserveDeviceLinkArchive(sessionId, {
        sourcePublicKey: archive.sourcePublicKey,
      });
      let partNumber = 1;
      let uploadedBytes = 0;
      for await (const part of archive.parts) {
        setStatus(`Đang chuyển phần ${partNumber} · ${Math.floor(uploadedBytes / 1024 / 1024)} MB`);
        let uploaded = false;
        for (let attempt = 0; attempt < 3 && !uploaded; attempt += 1) {
          const { uploadUrl } = await getDeviceLinkArchivePartUploadUrl(sessionId, partNumber, {
            contentLength: part.bytes.byteLength,
            isFinal: part.isFinal,
          });
          const response = await fetch(uploadUrl, {
            method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: part.bytes,
          });
          uploaded = response.ok;
        }
        if (!uploaded) throw new Error('upload failed');
        uploadedBytes += part.bytes.byteLength;
        partNumber += 1;
      }
      await completeDeviceLinkArchive(sessionId);
      setStatus('Đã chuyển lịch sử. Thiết bị mới đang nhập dữ liệu.');
    } catch (err) {
      console.error('[Device link] Transfer error:', err);
      setStatus(err.response?.data?.message || 'Không thể chuyển lịch sử. Hãy thử lại với QR mới.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {mode === 'scan' && <QRScannerModal onClose={() => setMode(null)} onDeviceLink={sendArchive} />}
      {mode !== 'scan' && (
        <Modal onClose={onClose} boxClassName="max-w-sm bg-base-100 border border-base-300 shadow-2xl">
          <h3 className="text-base font-bold">Liên kết thiết bị</h3>
          {!mode && !flow && (
            <div className="mt-4 flex flex-col gap-2">
              <p className="text-xs text-base-content/60">Thiết bị mới phải đăng nhập và đăng ký khóa trước khi liên kết.</p>
              <Button onClick={() => setFlow('qr')} disabled={busy} variant="primary" className="btn-sm rounded-full">Liên kết bằng QR</Button>
              <Button onClick={() => setFlow('otp')} disabled={busy} className="btn-sm rounded-full bg-base-200">Liên kết bằng OTP 6 số</Button>
            </div>
          )}
          {!mode && flow === 'qr' && (
            <DeviceLinkQrView
              busy={busy}
              onCreate={() => createLink('qr')}
              onScan={() => setMode('scan')}
              onBack={() => setFlow(null)}
            />
          )}
          {!mode && flow === 'otp' && (
            <DeviceLinkOtpView
              busy={busy}
              onCreate={() => createLink('code')}
              onEnter={() => setMode('enter-code')}
              onBack={() => setFlow(null)}
            />
          )}
          {mode === 'qr' && (
            <div className="mt-4 flex flex-col items-center gap-3">
              {qr && <img src={qr} alt="QR liên kết thiết bị mới" className="w-[220px] max-w-full rounded-xl border border-base-300" />}
              <p className="text-center text-xs text-base-content/60">{status}</p>
            </div>
          )}
          {mode === 'code' && (
            <div className="mt-4 flex flex-col items-center gap-3">
              <p className="text-center text-xs text-base-content/60">{status}</p>
              <code className="rounded-lg bg-base-200 px-4 py-2 text-2xl font-bold tracking-[0.25em]">{manualCode}</code>
              <Button onClick={copyManualCode} className="btn-sm">Sao chép mã OTP</Button>
              <p className="text-center text-xs text-base-content/60">Mã xác minh để đối chiếu: <strong>{verifyCode}</strong></p>
            </div>
          )}
          {mode === 'enter-code' && (
            <form onSubmit={approveManualCode} className="mt-4 flex flex-col gap-3">
              <p className="text-xs text-base-content/60">Nhập mã OTP 6 số đang hiện trên thiết bị mới cùng tài khoản.</p>
              <input autoFocus inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={enteredCode} onChange={event => setEnteredCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="input input-bordered text-center text-xl tracking-[0.35em]" placeholder="000000" />
              <Button type="submit" variant="primary" disabled={busy || enteredCode.length !== 6}>Kiểm tra mã</Button>
            </form>
          )}
          {mode === 'confirm-code' && (
            <div className="mt-4 flex flex-col gap-3">
              <p className="text-sm">Mã xác minh: <strong className="font-mono">{verifyCode}</strong></p>
              <p className="text-xs text-base-content/60">Chỉ tiếp tục khi mã này trùng với mã trên thiết bị mới.</p>
              <Button onClick={() => sendArchive(manualTransfer)} disabled={busy} variant="primary">Mã khớp — Chuyển lịch sử</Button>
            </div>
          )}
          {mode === 'sending' && <p className="mt-4 text-sm text-base-content/70">{status}</p>}
        </Modal>
      )}
    </>
  );
}
