import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { MessageCircleIcon } from '@hugeicons/core-free-icons';
import { toast } from '../common/toastStore';
import ConfirmModal from '../common/ConfirmModal';
import { useAuth } from '../../context/AuthContext';
import { useGroupCall } from '../../context/GroupCallContext';
import { useSocket } from '../../hooks/useSocket';
import ChatHeader from './ChatHeader';
import MessageList from './MessageList';
import RoomDrawer from './RoomDrawer';
import MessageInput from './MessageInput';
import ForwardModal from './ForwardModal';
import LeaveOwnerModal from './LeaveOwnerModal';
import RoomSettingsModal from './RoomSettingsModal';
import ChatThemeModal from './ChatThemeModal';
import InviteModal from './InviteModal';
import PollModal from './PollModal';
import useChatScroll from '../../hooks/chat/useChatScroll';
import useChatMessages from '../../hooks/chat/useChatMessages';
import useBlockedUserIds from '../../hooks/useBlockedUserIds';
import useRoomEncryption from '../../hooks/chat/useRoomEncryption';
import useRoomManagement from '../../hooks/chat/useRoomManagement';
import { getMyRooms } from '../../api/rooms.api';
import { getAttachmentDownloadUrl } from '../../api/rooms.api';
import { getUserProfile } from '../../api/friends.api';
import { decryptFileWithKey } from '../../crypto';
import { getChatBackgroundStyle, getChatMessageColor } from '../../utils/chatBackgrounds';

const getDMPartner = (room, currentUser) => {
  if (!room?.isDM || !room?.members) return null;
  return room.members.find(m => m._id?.toString() !== currentUser._id?.toString());
};

export default function ChatWindow({ room, onCloseChat, onBackToFriends, onInitiateCall, onInitiateGroupCall, onViewProfile }) {
  const { user }          = useAuth();
  const { emit, on, isConnected, reconnectFailed } = useSocket();
  const { activeCallRooms, callState: groupCallState } = useGroupCall();
  const { bottomRef, containerRef, showScrollBottom, scrollToBottom, handleScroll } = useChatScroll();

  // Desktop mở sẵn RoomDrawer làm cột thứ 4; mobile là overlay full màn hình nên mặc định đóng.
  const [showMembers, setShowMembers] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showBackgroundModal, setShowBackgroundModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [forwardTargetMessage, setForwardTargetMessage] = useState(null);
  const [showForward, setShowForward] = useState(false);
  const [drawerWidth, setDrawerWidth] = useState(300);
  const [dmAccess, setDmAccess] = useState(null);
  const resizeStart = useRef(null);
  const mobileSwipeStart = useRef(null);

  const { encryptForRoom, encryptFileForRoom, FILE_UPLOAD_CONFIG, fetchRoomDevicePublicKeys, redistributeSenderKey } = useRoomEncryption(user?._id);

  const {
    dmPartnerOnline, currentEpoch, roomMembers, admins, ownerId,
    roomName, roomAvatar, roomIsPrivate, roomJoinPolicy, chatBackground, chatBackgroundImage, chatMessageColor, isOwner,
    grantedPermissions, pinnedMessageId, hasPinPermission, hasPollPermission,
    showJoinRequests, joinRequests,
    confirmAction, setConfirmAction,
    showLeaveOwnerModal, setShowLeaveOwnerModal,
    handleRotateKey, handleLeaveRoom, handleLeaveButtonClick,
    handleToggleJoinRequests, handleApproveRequest, handleRejectRequest,
    handleConfirmAction, handlePinMessage, handleUnpinMessage,
  } = useRoomManagement(room, user, { emit, on, isConnected }, { onBackToFriends, fetchRoomDevicePublicKeys, redistributeSenderKey });

  // Bọc encryptForRoom với room/members/epoch hiện hành — useChatMessages chỉ cần gọi "mã hóa text này".
  const encryptDraftForRoom = useCallback(
    (text) => encryptForRoom({ ...room, members: roomMembers }, text, currentEpoch),
    [room, roomMembers, currentEpoch, encryptForRoom]
  );

  const {
    messages, hasMore, typing, replyTo, setReplyTo,
    loadMore, handleReact, handleTyping, handleEdit, handlePollVote, partnerReadAt,
  } = useChatMessages(room, user, { emit, on, isConnected }, { bottomRef, containerRef, encryptForRoom: encryptDraftForRoom });

  // Ẩn tin nhắn của người mình đã chặn trong group chung — DM đã bị chặn toàn bộ ở mức phòng
  // (canContactDm phía dưới) nên không cần lọc thêm ở đây.
  const blockedIds = useBlockedUserIds();
  const visibleMessages = useMemo(
    () => room?.isDM ? messages : messages.filter(m => !blockedIds.has(m.sender?._id?.toString())),
    [messages, blockedIds, room?.isDM]
  );

  const handleMessageScroll = useCallback(() => {
    handleScroll();
    if (containerRef.current?.scrollTop <= 100) loadMore();
  }, [containerRef, handleScroll, loadMore]);

  const roomId = room?._id;
  const dmPartnerId = room?.isDM ? getDMPartner(room, user)?._id : null;
  const currentDmAccess = dmAccess?.userId === dmPartnerId ? dmAccess : null;
  const canContactDm = !room?.isDM || currentDmAccess?.friendshipStatus === 'accepted' && !currentDmAccess?.blockedByMe;

  useEffect(() => {
    if (!dmPartnerId) return;
    let active = true;
    let version = 0;
    const loadProfile = () => {
      const request = ++version;
      getUserProfile(dmPartnerId)
        .then(profile => {
          if (active && request === version) setDmAccess({ userId: dmPartnerId, blockedByMe: profile.blockedByMe, friendshipStatus: profile.friendshipStatus });
        })
        .catch(() => { if (active && request === version) setDmAccess({ userId: dmPartnerId, blockedByMe: false, friendshipStatus: 'none' }); });
    };
    loadProfile();
    const syncBlock = (event) => {
      if (event.detail.userId === dmPartnerId) {
        version++;
        // Block giờ chỉ hủy lời mời đang chờ — friendship đã accepted vẫn được giữ nguyên (xem friends.service.js blockUser).
        setDmAccess(prev => ({
          userId: dmPartnerId,
          blockedByMe: event.detail.blocked,
          friendshipStatus: prev?.friendshipStatus === 'accepted' ? 'accepted' : 'none',
        }));
      }
    };
    const offAccepted = on('friend:request_accepted', loadProfile);
    const offUnfriended = on('friend:unfriended', () => {
      version++;
      setDmAccess(prev => prev?.userId === dmPartnerId ? { ...prev, friendshipStatus: 'none' } : prev);
    });
    window.addEventListener('user:block_changed', syncBlock);
    return () => { active = false; offAccepted(); offUnfriended(); window.removeEventListener('user:block_changed', syncBlock); };
  }, [dmPartnerId, on]);

  const handleResizeStart = (event) => {
    if (event.button !== 0) return;
    resizeStart.current = { x: event.clientX, width: drawerWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleResizeMove = (event) => {
    if (!resizeStart.current) return;
    const nextWidth = resizeStart.current.width + resizeStart.current.x - event.clientX;
    const maxWidth = Math.min(640, Math.max(260, window.innerWidth * 0.55));
    setDrawerWidth(Math.max(260, Math.min(maxWidth, nextWidth)));
  };

  const handleResizeEnd = (event) => {
    resizeStart.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleMobileSwipeStart = (event) => {
    if (window.innerWidth >= 768) return;
    if (event.target.closest?.('button, input, textarea, select, a')) return;
    const touch = event.touches[0];
    if (touch.clientX <= 24 || touch.clientX >= window.innerWidth - 24) {
      mobileSwipeStart.current = { x: touch.clientX, y: touch.clientY };
    }
  };

  const handleMobileSwipeEnd = (event) => {
    const start = mobileSwipeStart.current;
    mobileSwipeStart.current = null;
    if (!start) return;
    const touch = event.changedTouches[0];
    const horizontal = touch.clientX - start.x;
    const vertical = touch.clientY - start.y;
    if (Math.abs(horizontal) < 72 || Math.abs(horizontal) <= Math.abs(vertical)) return;
    if (start.x <= 24 && horizontal > 0) onCloseChat();
    if (start.x >= window.innerWidth - 24 && horizontal < 0) setShowMembers(true);
  };

  const handleSend = useCallback(async (content, replyToId, type = 'text', fileName = null, ttlSeconds = null) => {
    // Dùng roomMembers (state sống) thay vì prop room (snapshot cũ) — tránh wrap Sender Key thừa cho thiết bị đã rời nhóm.
    const roomWithMembers = { ...room, members: roomMembers };

    if (FILE_UPLOAD_CONFIG[type]) {
      // Ném ngược lỗi cho MessageInput báo đúng từng file khi gửi nhiều file 1 lúc.
      const arrayBuffer = await content.arrayBuffer();
      const payload = await encryptFileForRoom(roomWithMembers, arrayBuffer, type, {
        fileName: fileName || content.name || '',
        mimeType: content.type || '',
      }, currentEpoch);
      emit('message:send', { roomId, ...payload, type, replyTo: replyToId, fileName: null, ttlSeconds });
      setReplyTo(null);
      return;
    }

    try {
      const payload = await encryptForRoom(roomWithMembers, content, currentEpoch);

      emit('message:send', {
        roomId,
        ...payload,
        type,
        replyTo: replyToId,
        fileName,
        ttlSeconds,
      });

      setReplyTo(null);
    } catch (err) {
      console.error('[E2EE] Send error:', err);
      toast.error('Không thể mã hóa tin nhắn E2EE');
    }
  }, [emit, roomId, room, roomMembers, currentEpoch, setReplyTo, encryptForRoom, encryptFileForRoom, FILE_UPLOAD_CONFIG]);

  const handleForwardClick = useCallback((message) => {
    setForwardTargetMessage(message);
    setShowForward(true);
  }, []);

  const handleForwardSend = useCallback(async (targetRoomId, originalMsg) => {
    if (!originalMsg || originalMsg.isDeleted) {
      toast.error('Không thể chuyển tiếp tin nhắn đã bị thu hồi.');
      return;
    }

    try {
      const rooms = await getMyRooms();
      const targetRoom = rooms.find(r => r._id === targetRoomId);
      if (!targetRoom) {
        throw new Error('Không tìm thấy phòng để chuyển tiếp.');
      }

      let payload;
      if (FILE_UPLOAD_CONFIG[originalMsg.type]) {
        // File mã hóa bằng key phòng gốc, phòng đích key khác — phải tải+giải mã rồi mã hóa+upload lại, không bọc URL như text.
        if (!originalMsg.__key) {
          throw new Error('Không có khóa giải mã file gốc để chuyển tiếp.');
        }
        const pointer = JSON.parse(originalMsg.decryptedText || originalMsg.content);
        const url = await getAttachmentDownloadUrl(originalMsg.room?._id || originalMsg.room, pointer.attachmentId);
        const res = await fetch(url);
        const ciphertextBuf = await res.arrayBuffer();
        const decrypted = await decryptFileWithKey(ciphertextBuf, pointer.iv, originalMsg.__key, {
          maxOriginalSize: FILE_UPLOAD_CONFIG[originalMsg.type].maxCiphertextSize,
        });
        payload = await encryptFileForRoom(targetRoom, decrypted.arrayBuffer, originalMsg.type, {
          fileName: pointer.name || '',
          mimeType: pointer.mimeType || decrypted.mimeType,
        });
      } else {
        payload = await encryptForRoom(targetRoom, originalMsg.content);
      }

      emit('message:send', {
        roomId: targetRoomId,
        ...payload,
        type: originalMsg.type,
        fileName: null,
        forwardedFrom: originalMsg._id
      });
    } catch (err) {
      console.error('[E2EE] Forward error:', err);
      toast.error(FILE_UPLOAD_CONFIG[originalMsg.type]
        ? 'Không thể tải/mã hóa lại file để chuyển tiếp.'
        : 'Không thể mã hóa tin nhắn chuyển tiếp.');
    }
  }, [emit, encryptForRoom, encryptFileForRoom, FILE_UPLOAD_CONFIG]);

  if (!room) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-base-100 text-base-content/60 p-8 select-none">
        <HugeiconsIcon icon={MessageCircleIcon} size={56} strokeWidth={1.8} className="mb-4 opacity-30" />
        <p className="text-lg font-bold text-base-content">Chào mừng bạn đến với Chat App!</p>
        <p className="text-sm opacity-70 mt-1">Chọn một phòng chat hoặc Bạn bè ở sidebar để bắt đầu trò chuyện.</p>
      </div>
    );
  }

  const dmPartner = getDMPartner(room, user);
  const displayName = room.isDM
    ? (dmPartner?.nickname || dmPartner?.username || 'Người dùng Messenger')
    : roomName;

  // isOnline === null nghĩa chủ tài khoản đã ẩn trạng thái hoạt động — tách riêng khỏi offline thật.
  const onlineMembers = !room.isDM ? (roomMembers?.filter(m => m.isOnline === true) || []) : [];
  const offlineMembers = !room.isDM ? (roomMembers?.filter(m => m.isOnline === false) || []) : [];
  const hiddenStatusMembers = !room.isDM ? (roomMembers?.filter(m => m.isOnline === null) || []) : [];
  const isAdmin = !room.isDM && (isOwner || admins.includes(user._id?.toString()));

  return (
    <div
      onTouchStart={handleMobileSwipeStart}
      onTouchEnd={handleMobileSwipeEnd}
      className="flex-1 flex flex-row h-full overflow-hidden bg-base-100 text-base-content relative"
    >
      {/* Vùng chat chính (giữa) */}
      <div style={{ containerType: 'size' }} className="flex-1 flex flex-col h-full min-w-0 overflow-hidden bg-base-100 relative">

        {/* Banner mất kết nối — luôn nằm trên cùng khung chat, tự ẩn khi socket kết nối lại.
            Sau khi hết lượt tự thử (reconnectFailed), socket.io ngừng tự thử hẳn nên đổi sang
            báo rõ + nút tải lại trang thay vì tiếp tục nói "đang thử" (không còn đúng nữa). */}
        {!isConnected && (
          <div className="w-full bg-warning text-warning-content text-xs text-center py-1 flex-shrink-0 z-20 flex items-center justify-center gap-2">
            {reconnectFailed ? (
              <>
                <span>Không thể kết nối lại</span>
                <button
                  onClick={() => window.location.reload()}
                  className="btn btn-xs bg-base-100 text-base-content rounded-full"
                >
                  Tải lại trang
                </button>
              </>
            ) : (
              <span>Mất kết nối — đang thử kết nối lại...</span>
            )}
          </div>
        )}

        <ChatHeader
          room={room}
          dmPartner={dmPartner}
          dmPartnerOnline={dmPartnerOnline}
          roomAvatar={roomAvatar}
          displayName={displayName}
          roomMembers={roomMembers}
          showMembers={showMembers}
          onToggleMembers={() => setShowMembers(!showMembers)}
          onCloseChat={onCloseChat}
          onBackToFriends={onBackToFriends}
          onInitiateCall={onInitiateCall}
          onInitiateGroupCall={onInitiateGroupCall}
          onViewProfile={onViewProfile}
          canContactDm={canContactDm}
        />

        {!room.isDM && groupCallState === 'idle' && activeCallRooms.has(room._id) && (
          <div className="mx-4 mt-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-between gap-2 text-sm">
            <span className="text-primary font-medium">Cuộc gọi nhóm đang diễn ra</span>
            <button
              type="button"
              onClick={() => onInitiateGroupCall(room, roomMembers, 'video')}
              className="btn btn-primary btn-xs"
            >
              Tham gia
            </button>
          </div>
        )}

        {pinnedMessageId && (
          <button
            type="button"
            onClick={() => document.getElementById(`msg-${pinnedMessageId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            className="mx-4 mt-2 text-left text-xs font-semibold text-warning hover:underline w-fit"
          >
            📌 Tin nhắn đã ghim
          </button>
        )}

        <MessageList
          containerRef={containerRef}
          onScroll={handleMessageScroll}
          hasMore={hasMore}
          backgroundStyle={getChatBackgroundStyle(chatBackground, chatBackgroundImage)}
          messageTextColor={getChatMessageColor(chatMessageColor)}
          messages={visibleMessages}
          onReact={handleReact}
          onReply={setReplyTo}
          isDM={room.isDM}
          partnerReadAt={partnerReadAt}
          onForwardClick={handleForwardClick}
          onEdit={handleEdit}
          canPin={hasPinPermission}
          pinnedMessageId={pinnedMessageId}
          onPinMessage={handlePinMessage}
          onUnpinMessage={handleUnpinMessage}
          onPollVote={handlePollVote}
          onViewProfile={onViewProfile}
          typing={typing}
          bottomRef={bottomRef}
          showScrollBottom={showScrollBottom}
          onScrollToBottom={scrollToBottom}
        />

        <div className="flex-shrink-0">
          {hasPollPermission && !room.isDM && (
            <button type="button" onClick={() => setShowPollModal(true)} className="ml-4 mb-1 text-xs font-semibold text-primary hover:underline">
              + Tạo khảo sát
            </button>
          )}
          {canContactDm ? (
            <MessageInput
              onSend={handleSend}
              onTyping={handleTyping}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
              roomId={room._id}
            />
          ) : (
            <p className="border-t border-base-300 p-3 text-center text-sm text-base-content/60">
              {currentDmAccess?.blockedByMe ? 'Bạn đã chặn người này.' : 'Cần kết bạn để nhắn tin trực tiếp.'}
            </p>
          )}
        </div>
      </div>

      {/* Cột 4: Thông tin cuộc trò chuyện bên phải */}
      {showMembers && (
        <>
          <div className="hidden md:block relative w-px flex-shrink-0 bg-base-300">
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Kéo để đổi kích thước bảng thông tin"
              title="Kéo để phóng to hoặc thu nhỏ profile"
              onPointerDown={handleResizeStart}
              onPointerMove={handleResizeMove}
              onPointerUp={handleResizeEnd}
              onPointerCancel={handleResizeEnd}
              className="absolute inset-y-0 -left-2 w-5 cursor-col-resize touch-none z-10"
            />
          </div>
          <RoomDrawer
            room={room}
            dmPartner={dmPartner}
            blockedByMe={currentDmAccess?.blockedByMe}
            displayName={displayName}
            dmPartnerOnline={dmPartnerOnline}
            roomAvatar={roomAvatar}
            roomIsPrivate={roomIsPrivate}
            isOwner={isOwner}
            isAdmin={isAdmin}
            user={user}
            ownerId={ownerId}
            admins={admins}
            grantedPermissions={grantedPermissions}
            drawerWidth={drawerWidth}
            roomMembers={roomMembers}
            onlineMembers={onlineMembers}
            offlineMembers={offlineMembers}
            hiddenStatusMembers={hiddenStatusMembers}
            joinRequests={joinRequests}
            showJoinRequests={showJoinRequests}
            onToggleJoinRequests={handleToggleJoinRequests}
            onApproveRequest={handleApproveRequest}
            onRejectRequest={handleRejectRequest}
            onOpenSettings={() => setShowSettingsModal(true)}
            onOpenBackground={() => setShowBackgroundModal(true)}
            onOpenInvite={() => setShowInviteModal(true)}
            onRotateKey={handleRotateKey}
            onViewProfile={onViewProfile}
            onClose={() => setShowMembers(false)}
            setConfirmAction={setConfirmAction}
            onLeaveClick={handleLeaveButtonClick}
            messages={messages}
            hasMore={hasMore}
            loadMore={loadMore}
            onSelectMessage={(msgId) => {
              const element = document.getElementById(`msg-${msgId}`);
              element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
          />
        </>
      )}

      {/* Modal xác nhận rời nhóm / kick / cấp-hủy quyền admin / chuyển quyền chủ phòng */}
      {confirmAction && (
        <ConfirmModal
          title={
            confirmAction.type === 'leave' ? 'Rời khỏi nhóm này?' :
            confirmAction.type === 'delete-room' ? 'Hủy phòng này?' :
            confirmAction.type === 'kick' ? `Xóa ${confirmAction.memberName} khỏi nhóm?` :
            confirmAction.type === 'transfer' ? `Chuyển quyền chủ phòng cho ${confirmAction.memberName}?` :
            confirmAction.type === 'promote' ? `Phong ${confirmAction.memberName} làm quản trị viên?` :
            confirmAction.type === 'demote' ? `Gỡ quyền quản trị viên của ${confirmAction.memberName}?` :
            confirmAction.type === 'grant-permission' ? `Cấp quyền ${confirmAction.permission === 'create_polls' ? 'tạo khảo sát' : 'ghim tin nhắn'} cho ${confirmAction.memberName}?` :
            `Thu hồi quyền ${confirmAction.permission === 'create_polls' ? 'tạo khảo sát' : 'ghim tin nhắn'} của ${confirmAction.memberName}?`
          }
          description={
            confirmAction.type === 'leave' ? 'Bạn sẽ không nhận được tin nhắn mới từ nhóm này nữa. Có thể được mời lại sau.' :
            confirmAction.type === 'delete-room' ? 'Toàn bộ tin nhắn và thành viên sẽ bị xóa vĩnh viễn. Hành động này không thể hoàn tác.' :
            confirmAction.type === 'kick' ? 'Người này sẽ không đọc được tin nhắn mới của nhóm nữa.' :
            confirmAction.type === 'transfer' ? 'Bạn sẽ mất quyền chủ phòng (vẫn còn là quản trị viên). Chỉ chủ phòng mới chuyển quyền lại được.' :
            confirmAction.type === 'promote' ? 'Người này sẽ có quyền xóa thành viên thường khỏi nhóm.' :
            confirmAction.type === 'demote' ? 'Người này sẽ mất quyền xóa thành viên khỏi nhóm.' :
            confirmAction.type === 'grant-permission'
              ? `Người này sẽ ${confirmAction.permission === 'create_polls' ? 'tạo được khảo sát' : 'ghim/bỏ ghim được tin nhắn'} trong phòng.`
              : `Người này sẽ không còn ${confirmAction.permission === 'create_polls' ? 'tạo khảo sát' : 'ghim tin nhắn'} trong phòng.`
          }
          danger={confirmAction.type !== 'grant-permission'}
          onConfirm={handleConfirmAction}
          onCancel={() => setConfirmAction(null)}
        />
      )}
      {/* Modal chọn chủ phòng mới khi CHỦ PHÒNG rời nhóm (bỏ qua thì tự động gán như cũ) */}
      {showLeaveOwnerModal && (
        <LeaveOwnerModal
          roomMembers={roomMembers}
          currentUserId={user._id}
          onClose={() => setShowLeaveOwnerModal(false)}
          onConfirm={(newOwnerId) => { setShowLeaveOwnerModal(false); handleLeaveRoom(newOwnerId); }}
        />
      )}
      {/* Modal đổi tên phòng / công khai-riêng tư (chỉ chủ phòng) */}
      {showSettingsModal && (
        <RoomSettingsModal
          room={room}
          roomName={roomName}
          roomAvatar={roomAvatar}
          roomIsPrivate={roomIsPrivate}
          roomJoinPolicy={roomJoinPolicy}
          onClose={() => setShowSettingsModal(false)}
        />
      )}
      {/* Đổi nền khung chat — DM lẫn nhóm, bất kỳ thành viên nào */}
      {showBackgroundModal && (
          <ChatThemeModal
            room={room}
            chatBackground={chatBackground}
            chatBackgroundImage={chatBackgroundImage}
            chatMessageColor={chatMessageColor}
            onClose={() => setShowBackgroundModal(false)}
        />
      )}
      {showInviteModal && (
        <InviteModal
          room={room}
          isOwner={isOwner}
          isAdmin={isAdmin}
          roomMembers={roomMembers}
          currentUserId={user._id}
          onClose={() => setShowInviteModal(false)}
        />
      )}
      {showPollModal && (
        <PollModal
          onClose={() => setShowPollModal(false)}
          onCreate={(poll) => {
            handleSend(JSON.stringify(poll), null, 'poll');
            setShowPollModal(false);
          }}
        />
      )}
      <ForwardModal
        isOpen={showForward}
        onClose={() => setShowForward(false)}
        messageToForward={forwardTargetMessage}
        onForward={handleForwardSend}
      />
    </div>
  );
}
