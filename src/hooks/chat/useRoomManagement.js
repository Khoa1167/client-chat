import { useEffect, useState } from 'react';
import {
  getDeviceId, getPrivateKey, unwrapSenderKey, storeSenderKey,
} from '../../crypto';
import {
  rotateSenderKey, leaveRoom, deleteRoom, kickMember, promoteAdmin, demoteAdmin, transferOwnership,
  grantPermission, revokePermission,
  getJoinRequests, approveJoinRequest, rejectJoinRequest,
} from '../../api/rooms.api';
import { toast } from '../../components/common/toastStore';

// Lấy thông tin người đang chat cùng trong phòng DM
const getDMPartner = (room, currentUser) => {
  if (!room?.isDM || !room?.members) return null;
  return room.members.find(m => m._id?.toString() !== currentUser._id?.toString());
};

// State + handler quản lý phòng (thành viên/admin/quyền/tên/riêng-tư, Sender Key epoch, xin-vào-
// phòng...), tách khỏi ChatWindow — 1 useEffect socket duy nhất gom hết sự kiện liên quan phòng.
export default function useRoomManagement(room, user, { emit, on, isConnected }, { onBackToFriends, fetchRoomDevicePublicKeys, redistributeSenderKey }) {
  // isOnline === null nghĩa là đối phương đã ẩn trạng thái hoạt động (privacySettings) — giữ
  // nguyên null thay vì ép về false, không thì ChatHeader/RoomDrawer hiện nhầm "Không hoạt động".
  const [dmPartnerOnline, setDmPartnerOnline] = useState(
    () => getDMPartner(room, user)?.isOnline ?? null
  );
  const [rotatedEpoch, setRotatedEpoch] = useState(null);
  const currentEpoch = rotatedEpoch !== null ? rotatedEpoch : (room?.senderKeyEpoch ?? 0);
  // Danh sách thành viên/admin/chủ phòng — khởi tạo từ prop, cập nhật realtime qua
  // 'room:member_left'/'room:updated' (room prop là snapshot, không tự đổi khi người khác
  // rời/bị kick/được phong admin trong lúc mình đang mở đúng phòng này)
  const [roomMembers, setRoomMembers] = useState(room?.members || []);
  const [admins, setAdmins] = useState((room?.admins || []).map(a => (a?._id || a)?.toString()));
  const [ownerId, setOwnerId] = useState((room?.createdBy?._id || room?.createdBy)?.toString());
  // Quyền lẻ host cấp riêng cho từng thành viên — key = userId, value = permission[].
  // Khởi tạo từ prop (room.grantedPermissions là plain object sau .lean()), cập nhật realtime qua
  // 'room:permissions_updated'.
  const [grantedPermissions, setGrantedPermissions] = useState(room?.grantedPermissions || {});
  const [pinnedMessageId, setPinnedMessageId] = useState(() => (room?.pinnedMessage?._id || room?.pinnedMessage)?.toString() || null);
  // Tên/avatar/công khai-riêng tư — khởi tạo từ prop, cập nhật realtime qua 'room:settings_updated'
  const [roomName, setRoomName] = useState(room?.name);
  const [roomAvatar, setRoomAvatar] = useState(room?.avatar);
  const [roomIsPrivate, setRoomIsPrivate] = useState(room?.isPrivate);
  const [roomJoinPolicy, setRoomJoinPolicy] = useState(room?.joinPolicy);
  // Nền khung chat — dùng chung DM lẫn nhóm, cập nhật realtime qua 'room:background_updated'
  const [chatBackground, setChatBackground] = useState(room?.chatBackground || 'default');
  const [chatBackgroundImage, setChatBackgroundImage] = useState(room?.chatBackgroundImage || '');
  const [chatMessageColor, setChatMessageColor] = useState(room?.chatMessageColor || 'default');
  const [showJoinRequests, setShowJoinRequests] = useState(false);
  const [joinRequests, setJoinRequests] = useState([]);
  // Modal xác nhận rời nhóm/kick/quản lý role-quyền/chuyển chủ phòng — null | { type: 'leave' } |
  // { type: 'kick'|'transfer'|'promote'|'demote', memberId, memberName }
  const [confirmAction, setConfirmAction] = useState(null);
  // Popup riêng khi CHỦ PHÒNG bấm rời nhóm — cho chọn người kế nhiệm trước, khác confirmAction
  // chung (không đủ chỗ cho danh sách chọn thành viên)
  const [showLeaveOwnerModal, setShowLeaveOwnerModal] = useState(false);

  // Lắng nghe các sự kiện WebSocket liên quan tới phòng/Sender Key/thành viên (khác useChatMessages
  // — hook đó chỉ lo message:*/typing:*)
  useEffect(() => {
    if (!room) return;

    emit('room:join', room._id);

    // Nhận Sender Key mới được phân phối cho thiết bị của mình (nhóm)
    const offSenderKeyNew = on('sender_key:new', async (dist) => {
      if (dist.room?.toString() !== room._id?.toString()) return;
      const devId = getDeviceId();
      const wrapped = dist.encryptedKeys?.[devId];
      if (!wrapped) return;
      try {
        const privateKey = await getPrivateKey(devId);
        if (!privateKey) return;
        const senderKey = await unwrapSenderKey(wrapped, privateKey);
        await storeSenderKey(room._id, dist.senderDeviceId, dist.epoch, senderKey);
      } catch (err) {
        console.error('[E2EE] Sender Key distribution error:', err);
      }
    });

    // Có người bấm "Xoay khóa nhóm" — cập nhật epoch hiện hành để lần gửi tiếp theo dùng khóa mới
    const offSenderKeyRotated = on('sender_key:rotated', ({ roomId: rId, epoch }) => {
      if (rId?.toString() === room._id?.toString()) setRotatedEpoch(epoch);
    });

    // Thành viên trong nhóm thêm/xoay/gỡ thiết bị
    const offKeyChanged = on('key:changed', async ({ userId: changedUserId }) => {
      if (!roomMembers?.some(m => m._id?.toString() === changedUserId?.toString())) return;
      const allDevicePublicKeys = await fetchRoomDevicePublicKeys(room);
      await redistributeSenderKey(room._id, currentEpoch, allDevicePublicKeys);
    });

      // Server đã xoay epoch trước event này; không phân phối Sender Key cũ cho thành viên mới.
      const offMemberJoined = on('room:member_joined', ({ roomId: rId, member }) => {
        if (rId?.toString() !== room._id?.toString()) return;
        setRoomMembers(prev => prev.some(m => m._id === member._id) ? prev : [...prev, member]);
      });

    // Có thành viên rời/bị kick — cập nhật danh sách thành viên đang hiển thị
    const offMemberLeft = on('room:member_left', ({ roomId: rId, userId: leftUserId }) => {
      if (rId?.toString() !== room._id?.toString()) return;
      setRoomMembers(prev => prev.filter(m => m._id?.toString() !== leftUserId?.toString()));
    });

    // Admin/chủ phòng thay đổi (phong/gỡ admin, chuyển quyền chủ phòng, hoặc kế vị khi chủ phòng rời)
    const offRoomUpdated = on('room:updated', ({ roomId: rId, admins: newAdmins, createdBy: newOwnerId }) => {
      if (rId?.toString() !== room._id?.toString()) return;
      if (newAdmins) setAdmins(newAdmins);
      if (newOwnerId) setOwnerId(newOwnerId);
    });

    // Host cấp hoặc thu hồi quyền lẻ cho một thành viên thường.
    const offPermissionsUpdated = on('room:permissions_updated', ({ roomId: rId, userId: targetUserId, permissions }) => {
      if (rId?.toString() !== room._id?.toString()) return;
      setGrantedPermissions(prev => ({ ...prev, [targetUserId]: permissions }));
    });

    const offPinnedMessage = on('room:pinned_message', ({ roomId: rId, pinnedMessageId: messageId }) => {
      if (rId?.toString() === room._id?.toString()) setPinnedMessageId(messageId || null);
    });

    // Có người xin vào phòng — thêm vào danh sách chờ duyệt đang hiển thị
    const offJoinRequested = on('room:join_requested', ({ roomId: rId, requester }) => {
      if (rId?.toString() !== room._id?.toString()) return;
      setJoinRequests(prev => prev.some(r => r._id === requester._id) ? prev : [...prev, requester]);
    });

    // Chủ phòng đổi tên/avatar, công khai/riêng tư, hoặc cần duyệt hay không
    const offSettingsUpdated = on('room:settings_updated', ({ roomId: rId, name, avatar, isPrivate, joinPolicy }) => {
      if (rId?.toString() !== room._id?.toString()) return;
      setRoomName(name);
      setRoomAvatar(avatar);
      setRoomIsPrivate(isPrivate);
      setRoomJoinPolicy(joinPolicy);
    });

    // Bất kỳ thành viên nào (DM lẫn nhóm) đổi nền khung chat — áp dụng chung cho cả phòng
    const offBackgroundUpdated = on('room:background_updated', ({ roomId: rId, chatBackground: bg, chatBackgroundImage: image, chatMessageColor: color }) => {
      if (rId?.toString() !== room._id?.toString()) return;
      setChatBackground(bg);
      setChatBackgroundImage(image || '');
      setChatMessageColor(color || 'default');
    });

    const partner = getDMPartner(room, user);
    const offOnline = on('user:online', ({ userId }) => {
      if (userId?.toString() === partner?._id?.toString()) {
        setDmPartnerOnline(true);
      }
    });
    const offOffline = on('user:offline', ({ userId }) => {
      if (userId?.toString() === partner?._id?.toString()) {
        setDmPartnerOnline(false);
      }
    });

    return () => {
      offSenderKeyNew(); offSenderKeyRotated(); offKeyChanged();
      offMemberJoined(); offMemberLeft(); offRoomUpdated(); offPermissionsUpdated(); offPinnedMessage();
      offJoinRequested(); offSettingsUpdated();
      offBackgroundUpdated();
      offOnline(); offOffline();
    };
  }, [room, user, on, emit, isConnected, currentEpoch, roomMembers, fetchRoomDevicePublicKeys, redistributeSenderKey]);

  const handleRotateKey = async () => {
    try {
      const data = await rotateSenderKey(room._id);
      setRotatedEpoch(data.epoch);
    } catch (err) {
      console.error('[E2EE] Rotate key error:', err);
      toast.error('Không thể xoay khóa nhóm');
    }
  };

  const handleLeaveRoom = async (newOwnerId) => {
    try {
      await leaveRoom(room._id, newOwnerId);
      onBackToFriends();
    } catch (err) {
      console.error('[Room] Leave error:', err);
      toast.error(err.response?.data?.message || 'Không thể rời nhóm');
    }
  };

  const handleDeleteRoom = async () => {
    try {
      await deleteRoom(room._id);
      onBackToFriends();
    } catch (err) {
      console.error('[Room] Delete room error:', err);
      toast.error(err.response?.data?.message || 'Không thể hủy phòng');
    }
  };

  const isOwner = !room?.isDM && ownerId === user._id?.toString();
  const isAdmin = !room?.isDM && (isOwner || admins.includes(user._id?.toString()));
  const userPermissions = grantedPermissions[user._id?.toString()] || [];
  // DM không có host/admin nhưng cả 2 phía đều được ghim tin nhắn (khớp hasRoomPermission server).
  const hasPinPermission = room?.isDM || isAdmin || userPermissions.includes('pin_messages') || userPermissions.includes('pin');
  const hasPollPermission = isOwner || isAdmin || userPermissions.includes('create_polls');

  const handlePinMessage = (messageId) => {
    emit('room:pin_message', { messageId }, (response) => {
      if (!response?.success) toast.error(response?.message || 'Không thể ghim tin nhắn');
    });
  };

  const handleUnpinMessage = () => {
    emit('room:unpin_message', { roomId: room._id }, (response) => {
      if (!response?.success) toast.error(response?.message || 'Không thể bỏ ghim tin nhắn');
    });
  };

  const handleLeaveButtonClick = () => {
    const others = roomMembers.filter(m => (m._id || m)?.toString() !== user._id?.toString());
    if (isOwner && others.length > 0) {
      setShowLeaveOwnerModal(true);
    } else {
      setConfirmAction({ type: 'leave' });
    }
  };

  const handleKickMember = async (memberId) => {
    try {
      await kickMember(room._id, memberId);
    } catch (err) {
      console.error('[Room] Kick error:', err);
      toast.error(err.response?.data?.message || 'Không thể xóa thành viên khỏi nhóm');
    }
  };

  const handlePromoteAdmin = async (memberId) => {
    try {
      await promoteAdmin(room._id, memberId);
    } catch (err) {
      console.error('[Room] Promote admin error:', err);
      toast.error(err.response?.data?.message || 'Không thể phong quản trị viên');
    }
  };

  const handleDemoteAdmin = async (memberId) => {
    try {
      await demoteAdmin(room._id, memberId);
    } catch (err) {
      console.error('[Room] Demote admin error:', err);
      toast.error(err.response?.data?.message || 'Không thể gỡ quyền quản trị viên');
    }
  };

  const handleTransferOwnership = async (memberId) => {
    try {
      await transferOwnership(room._id, memberId);
    } catch (err) {
      console.error('[Room] Transfer ownership error:', err);
      toast.error(err.response?.data?.message || 'Không thể chuyển quyền chủ phòng');
    }
  };

  const handleGrantPermission = async (memberId, permission) => {
    try {
      await grantPermission(room._id, memberId, permission);
    } catch (err) {
      console.error('[Room] Grant permission error:', err);
      toast.error(err.response?.data?.message || 'Không thể cấp quyền');
    }
  };

  const handleRevokePermission = async (memberId, permission) => {
    try {
      await revokePermission(room._id, memberId, permission);
    } catch (err) {
      console.error('[Room] Revoke permission error:', err);
      toast.error(err.response?.data?.message || 'Không thể thu hồi quyền');
    }
  };

  const handleToggleJoinRequests = async () => {
    const next = !showJoinRequests;
    setShowJoinRequests(next);
    if (!next) return;
    try {
      const data = await getJoinRequests(room._id);
      setJoinRequests(data);
    } catch (err) {
      console.error('[Room] Fetch join requests error:', err);
    }
  };

  const handleApproveRequest = async (userId) => {
    try {
      await approveJoinRequest(room._id, userId);
      setJoinRequests(prev => prev.filter(r => r._id !== userId));
    } catch (err) {
      console.error('[Room] Approve join request error:', err);
      toast.error(err.response?.data?.message || 'Không thể duyệt yêu cầu tham gia');
    }
  };

  const handleRejectRequest = async (userId) => {
    try {
      await rejectJoinRequest(room._id, userId);
      setJoinRequests(prev => prev.filter(r => r._id !== userId));
    } catch (err) {
      console.error('[Room] Reject join request error:', err);
      toast.error(err.response?.data?.message || 'Không thể từ chối yêu cầu tham gia');
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    if (confirmAction.type === 'leave') {
      await handleLeaveRoom();
    } else if (confirmAction.type === 'kick') {
      await handleKickMember(confirmAction.memberId);
    } else if (confirmAction.type === 'transfer') {
      await handleTransferOwnership(confirmAction.memberId);
    } else if (confirmAction.type === 'promote') {
      await handlePromoteAdmin(confirmAction.memberId);
    } else if (confirmAction.type === 'demote') {
      await handleDemoteAdmin(confirmAction.memberId);
    } else if (confirmAction.type === 'grant-permission') {
      await handleGrantPermission(confirmAction.memberId, confirmAction.permission);
    } else if (confirmAction.type === 'revoke-permission') {
      await handleRevokePermission(confirmAction.memberId, confirmAction.permission);
    } else if (confirmAction.type === 'delete-room') {
      await handleDeleteRoom();
    }
    setConfirmAction(null);
  };

  return {
    dmPartnerOnline, currentEpoch, roomMembers, admins, ownerId,
    roomName, roomAvatar, roomIsPrivate, roomJoinPolicy, chatBackground, chatBackgroundImage, chatMessageColor, isOwner, isAdmin,
    grantedPermissions, pinnedMessageId, hasPinPermission, hasPollPermission,
    showJoinRequests, joinRequests,
    confirmAction, setConfirmAction,
    showLeaveOwnerModal, setShowLeaveOwnerModal,
    handleRotateKey, handleLeaveRoom, handleLeaveButtonClick, handleDeleteRoom,
    handleKickMember, handlePromoteAdmin, handleDemoteAdmin, handleTransferOwnership,
    handleGrantPermission, handleRevokePermission,
    handlePinMessage, handleUnpinMessage,
    handleToggleJoinRequests, handleApproveRequest, handleRejectRequest,
    handleConfirmAction,
  };
}
