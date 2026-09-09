import { useEffect, useState } from 'react';
import { Copy, RotateCw } from '../icons';
import QRCode from 'qrcode';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { toast } from '../common/toastStore';
import { getInviteCode, inviteFriendToRoom, rotateInviteCode } from '../../api/rooms.api';
import { getFriends } from '../../api/friends.api';

const buildInviteUrl = (code) => `${window.location.origin}/?invite=${code}`;

// Mời vào nhóm qua link/QR + thêm thẳng bạn bè. Tự fetch inviteCode khi mount (đã bị ẩn khỏi GET /rooms để tránh lộ cho người ngoài).
export default function InviteModal({ room, isOwner, isAdmin, roomMembers, currentUserId, onClose }) {
  const [inviteCode, setInviteCode] = useState(null);
  const [inviteCodeExpiresAt, setInviteCodeExpiresAt] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [friendsToAdd, setFriendsToAdd] = useState([]);
  const [addedMemberIds, setAddedMemberIds] = useState([]);
  const [copied, setCopied] = useState(false);

  const regenerateQr = async (code) => {
    const dataUrl = await QRCode.toDataURL(buildInviteUrl(code), { width: 220, margin: 1 });
    setQrDataUrl(dataUrl);
  };

  useEffect(() => {
    (async () => {
      try {
        const data = await getInviteCode(room._id);
        setInviteCode(data.inviteCode);
        setInviteCodeExpiresAt(data.inviteCodeExpiresAt);
        await regenerateQr(data.inviteCode);
      } catch (err) {
        console.error('[Invite] Fetch/QR generate error:', err);
        toast.error('Không thể tải link mời');
      }
    })();

    if (isAdmin) {
      getFriends()
        .then(setFriendsToAdd)
        .catch(err => console.error('[AddMember] Fetch friends error:', err));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Thêm thẳng 1 bạn bè vào nhóm (họ tự accept/decline — xem FriendList.jsx tab "Lời mời vào nhóm")
  const handleAddMember = async (userId) => {
    try {
      await inviteFriendToRoom(room._id, userId);
      setAddedMemberIds(prev => [...prev, userId]);
    } catch (err) {
      console.error('[AddMember] Invite error:', err);
      toast.error(err.response?.data?.message || 'Không thể thêm thành viên');
    }
  };

  const handleRotateInvite = async () => {
    try {
      const data = await rotateInviteCode(room._id);
      setInviteCode(data.inviteCode);
      setInviteCodeExpiresAt(data.inviteCodeExpiresAt);
      await regenerateQr(data.inviteCode);
    } catch (err) {
      console.error('[Invite] Rotate error:', err);
      toast.error(err.response?.data?.message || 'Không thể tạo lại link mời');
    }
  };

  const inviteExpired = inviteCodeExpiresAt && new Date(inviteCodeExpiresAt) < new Date();

  return (
    <Modal onClose={onClose} boxClassName="max-w-sm bg-base-100 border border-base-300 shadow-2xl">
      <h3 className="text-base font-bold mb-3">Mời vào nhóm</h3>

      {inviteExpired && (
        <div className="alert alert-error py-2 px-3 text-xs font-semibold rounded-xl mb-3">
          <span>Link này đã hết hạn — người mới sẽ không tham gia được. {isOwner ? 'Hãy tạo lại link.' : 'Nhờ chủ phòng tạo lại link.'}</span>
        </div>
      )}

      <div className={`flex flex-col items-center gap-3 ${inviteExpired ? 'opacity-40' : ''}`}>
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="QR mời vào nhóm" className="rounded-xl border border-base-300" />
        ) : (
          <div className="w-[220px] h-[220px] flex items-center justify-center bg-base-200 rounded-xl text-xs text-base-content/40">
            Đang tạo mã QR...
          </div>
        )}

        {inviteCode && (
          <div className="join w-full">
            <input
              readOnly
              value={buildInviteUrl(inviteCode)}
              className="input input-bordered input-sm join-item w-full bg-base-200 font-mono text-[11px]"
              onClick={e => e.target.select()}
            />
            <Button
              onClick={async () => {
                await navigator.clipboard.writeText(buildInviteUrl(inviteCode));
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              variant="primary" size="sm" className="join-item"
            >
              <Copy className="w-3.5 h-3.5" /> {copied ? 'Đã copy' : 'Copy'}
            </Button>
          </div>
        )}

        {!inviteExpired && inviteCodeExpiresAt && (
          <span className="text-[11px] text-base-content/40">
            Hết hạn {formatDistanceToNow(new Date(inviteCodeExpiresAt), { addSuffix: true, locale: vi })}
          </span>
        )}
      </div>

      {isOwner && (
        <Button
          onClick={handleRotateInvite}
          size="xs" className="!text-error gap-1 normal-case mt-3"
        >
          <RotateCw className="w-3 h-3" /> Tạo lại link (vô hiệu hóa link cũ, gia hạn thêm 7 ngày)
        </Button>
      )}

      {isAdmin && (
        <div className="mt-4 pt-4 border-t border-base-300">
          <h4 className="text-xs font-bold text-base-content/60 uppercase tracking-wide mb-2">Thêm thành viên</h4>
          {friendsToAdd.length === 0 ? (
            <p className="text-xs text-base-content/40 italic">Chưa có bạn bè nào để thêm.</p>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto hide-scrollbar">
              {friendsToAdd.map(f => {
                const friend = f.sender?._id?.toString() === currentUserId?.toString() ? f.receiver : f.sender;
                if (!friend) return null;
                const isMember = roomMembers.some(m => (m._id || m)?.toString() === friend._id?.toString());
                const isAdded = addedMemberIds.includes(friend._id);
                return (
                  <div key={friend._id} className="flex items-center justify-between gap-2">
                    <span className="text-sm truncate">{friend.nickname || friend.username}</span>
                    <Button
                      disabled={isMember || isAdded}
                      onClick={() => handleAddMember(friend._id)}
                      variant="primary" size="xs" pill className="font-semibold disabled:btn-disabled"
                    >
                      {isMember ? 'Đã trong nhóm' : isAdded ? 'Đã gửi lời mời' : 'Thêm'}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
