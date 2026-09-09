import { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { computeFingerprint } from '../../crypto';
import { getUserDevices } from '../../api/users.api';
import { safeGet, safeSet } from '../../utils/safeStorage';

export default function SafetyNumberModal({ user, contactUser, onClose, zIndex }) {
  const [myFingerprint, setMyFingerprint] = useState('Đang tính toán...');
  const [contactFingerprint, setContactFingerprint] = useState('Đang tính toán...');
  const storageKey = `verified_sn_${user._id}_${contactUser._id}`;
  // Modal luôn mount mới mỗi lần mở nên đọc 1 lần lúc mount là đủ.
  const [isVerified, setIsVerified] = useState(() => safeGet(localStorage, storageKey) === 'true');

  useEffect(() => {
    const calcFingerprints = async () => {
      const myActiveDevice = user.devices?.find(d => !d.isRevoked);
      if (myActiveDevice) {
        const fp = await computeFingerprint(myActiveDevice.publicKey);
        setMyFingerprint(fp);
      } else {
        setMyFingerprint('Chưa đăng ký thiết bị');
      }

      // room/members populate không trả devices (tránh lộ metadata) — phải gọi riêng endpoint đã lọc sẵn.
      try {
        const contactDevices = await getUserDevices(contactUser._id);
        if (contactDevices && contactDevices.length > 0) {
          const fp = await computeFingerprint(contactDevices[0].publicKey);
          setContactFingerprint(fp);
        } else {
          setContactFingerprint('Chưa đăng ký thiết bị');
        }
      } catch (err) {
        console.error('[E2EE] Không thể tải thiết bị của đối phương:', err);
        setContactFingerprint('Không thể tải mã của đối phương');
      }
    };

    calcFingerprints();
  }, [user, contactUser, storageKey]);

  const toggleVerify = () => {
    const nextState = !isVerified;
    setIsVerified(nextState);
    safeSet(localStorage, storageKey, nextState ? 'true' : 'false');
  };

  return (
    <Modal onClose={onClose} boxClassName="max-w-md bg-base-100 border border-base-300 shadow-2xl" zIndex={zIndex}>
        <div className="flex items-center justify-between border-b border-base-300 pb-3 mb-4">
          <h3 className="text-base font-bold flex items-center gap-1.5">
            🔐 Mã An Toàn (Safety Number)
          </h3>
          <Button onClick={onClose} size="sm" circle>
            ✕
          </Button>
        </div>

        <div className="text-xs text-base-content/70 space-y-3">
          <p>
            So sánh mã an toàn này với đối phương qua kênh liên lạc trực tiếp (quét mã / điện thoại) để đảm bảo không ai can thiệp vào cuộc trò chuyện.
          </p>

          <div className="bg-base-200 border border-base-300 rounded-xl p-3.5 space-y-2">
            <span className="text-[11px] font-bold text-base-content/60 uppercase tracking-wider">Mã của bạn ({user.nickname || user.username})</span>
            <p className="font-mono text-xs font-bold text-base-content break-all leading-relaxed bg-base-100 border border-base-300 p-2 rounded-lg text-center select-all">
              {myFingerprint}
            </p>
          </div>

          <div className="bg-base-200 border border-base-300 rounded-xl p-3.5 space-y-2">
            <span className="text-[11px] font-bold text-base-content/60 uppercase tracking-wider">Mã của {contactUser.nickname || contactUser.username}</span>
            <p className="font-mono text-xs font-bold text-base-content break-all leading-relaxed bg-base-100 border border-base-300 p-2 rounded-lg text-center select-all">
              {contactFingerprint}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-base-300 mt-3">
          <Button
            onClick={toggleVerify}
            variant={isVerified ? 'success' : 'ghost'}
            size="sm" pill className={isVerified ? '' : 'bg-base-200'}
          >
            {isVerified ? '✓ Đã xác minh an toàn' : 'Đánh dấu đã xác minh'}
          </Button>

          <Button onClick={onClose} size="sm" pill className="bg-base-200">
            Đóng
          </Button>
        </div>
    </Modal>
  );
}
