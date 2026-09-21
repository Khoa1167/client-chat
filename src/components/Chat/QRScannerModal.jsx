import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import jsQR from 'jsqr';
import Modal from '../common/Modal';
import { toast } from '../common/toastStore';

// Quét QR mời vào nhóm (chiều ngược InviteModal.jsx) hoặc QR profile cá nhân (chiều ngược
// ShareProfileModal.jsx) — decode ra link rồi đẩy đúng param (?invite=/?add-friend=) để tái dùng
// luồng xem trước có sẵn ở ChatPage.jsx (chỉ hiện preview phòng/trang cá nhân, KHÔNG tự vào phòng
// hay tự gửi lời mời kết bạn — người dùng tự bấm hành động trong preview/profile nếu muốn).
export default function QRScannerModal({ onClose, onDeviceLink }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const [error, setError] = useState(null);
  const [, setSearchParams] = useSearchParams();

  useEffect(() => {
    let cancelled = false;

    const scanLoop = () => {
      const video = videoRef.current;
      if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(scanLoop);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);

      if (code?.data) {
        try {
          const params = new URL(code.data).searchParams;
          const inviteCode = params.get('invite');
          const addFriendId = params.get('add-friend');
          const deviceLinkSession = params.get('device-link');
          const deviceLinkKey = params.get('device-link-key');
          if (inviteCode) {
            setSearchParams(prev => { prev.set('invite', inviteCode); return prev; });
          } else if (addFriendId) {
            setSearchParams(prev => { prev.set('add-friend', addFriendId); return prev; });
          } else if (deviceLinkSession && onDeviceLink) {
            const targetPublicKey = JSON.parse(deviceLinkKey || 'null');
            if (!targetPublicKey?.x || !targetPublicKey?.y) throw new Error('Thiếu khóa liên kết');
            onDeviceLink({ sessionId: deviceLinkSession, targetPublicKey });
            return;
          } else {
            throw new Error('Không phải mã QR hợp lệ');
          }
          onClose();
          return;
        } catch {
          toast.error('Mã QR không hợp lệ');
          // Không return — tiếp tục quét, có thể người dùng đang chĩa nhầm mã khác.
        }
      }
      rafRef.current = requestAnimationFrame(scanLoop);
    };

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        scanLoop();
      } catch (err) {
        console.error('[QR] Không mở được camera:', err);
        setError('Không thể truy cập camera — hãy cấp quyền camera cho trình duyệt rồi thử lại.');
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Modal onClose={onClose} boxClassName="max-w-sm bg-base-100 border border-base-300 shadow-2xl">
      <h3 className="text-base font-bold mb-3">{onDeviceLink ? 'Quét QR liên kết thiết bị' : 'Quét mã QR tìm kiếm nhóm hoặc bạn'}</h3>

      {error ? (
        <p className="text-sm text-error text-center py-8">{error}</p>
      ) : (
        <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-black">
          <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
          <div className="absolute inset-8 border-2 border-white/70 rounded-xl pointer-events-none" />
        </div>
      )}
      <p className="text-[11px] text-base-content/40 text-center mt-3">
        {onDeviceLink ? 'Hướng camera vào mã QR đang hiển thị trên thiết bị mới.' : 'Hướng camera vào mã QR mời vào nhóm hoặc QR trang cá nhân của người khác'}
      </p>
    </Modal>
  );
}
