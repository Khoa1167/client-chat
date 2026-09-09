import { useEffect, useState } from 'react';
import { Copy } from '../icons';
import QRCode from 'qrcode';
import Modal from '../common/Modal';
import Button from '../common/Button';

const buildProfileUrl = (userId) => `${window.location.origin}/?add-friend=${userId}`;

// Modal chia sẻ QR/link kết bạn, dùng chung cho profile của mình lẫn của bạn bè. Dùng thẳng userId
// làm định danh, không cần code/rotate/hết hạn như link mời phòng — link chỉ mở info đã public.
export default function ShareProfileModal({ userId, displayName, onClose }) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const url = buildProfileUrl(userId);

  useEffect(() => {
    QRCode.toDataURL(url, { width: 220, margin: 1 }).then(setQrDataUrl);
  }, [url]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Modal onClose={onClose} boxClassName="max-w-sm bg-base-100 border border-base-300 shadow-2xl" zIndex="z-[60]">
      <h3 className="text-base font-bold mb-3">
        Chia sẻ QR/link kết bạn{displayName ? ` — ${displayName}` : ''}
      </h3>

      <div className="flex flex-col items-center gap-3">
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="QR kết bạn" className="rounded-xl border border-base-300" />
        ) : (
          <div className="w-[220px] h-[220px] flex items-center justify-center bg-base-200 rounded-xl text-xs text-base-content/40">
            Đang tạo mã QR...
          </div>
        )}

        <div className="join w-full">
          <input
            readOnly
            value={url}
            className="input input-bordered input-sm join-item w-full bg-base-200 font-mono text-[11px]"
            onClick={e => e.target.select()}
          />
          <Button onClick={handleCopy} variant="primary" size="sm" className="join-item">
            <Copy className="w-3.5 h-3.5" /> {copied ? 'Đã copy' : 'Copy'}
          </Button>
        </div>

        <p className="text-[11px] text-base-content/40 text-center">
          Bất kỳ ai có link/QR này (đã đăng nhập) đều xem được trang cá nhân và gửi lời mời kết bạn.
        </p>
      </div>
    </Modal>
  );
}
