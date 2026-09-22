import { useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { MessageCircleIcon, Search01Icon, Image02Icon } from '@hugeicons/core-free-icons';
import {
  RotateCw, LogOut, UserX, Link2, UserPlus, Check, X, Pencil, Palette, Trash2, KeyRound,
} from '../icons';
import Button from '../common/Button';
import RoomPermissionsTab from './RoomPermissionsTab';
import SearchBar from './SearchBar';
import MediaGalleryTab from './MediaGalleryTab';
import BlockUserButton from '../common/BlockUserButton';

export default function RoomDrawer({
  room, dmPartner, blockedByMe, displayName, dmPartnerOnline, roomAvatar, roomIsPrivate,
  isOwner, isAdmin, user, ownerId, admins, grantedPermissions, drawerWidth,
  roomMembers, onlineMembers, offlineMembers, hiddenStatusMembers,
  joinRequests, showJoinRequests, onToggleJoinRequests, onApproveRequest, onRejectRequest,
  onOpenSettings, onOpenBackground, onOpenInvite, onRotateKey,
  onViewProfile, setConfirmAction, onLeaveClick, onClose,
  messages, onSelectMessage, hasMore, loadMore,
}) {
  // 'search' | 'gallery' (DM lẫn nhóm) | 'members' | 'permissions' (chỉ nhóm — role, quyền lẻ và chuyển chủ phòng).
  const [activeTab, setActiveTab] = useState(room.isDM ? 'search' : 'members');
  // DM không có Thành viên/Quản lý quyền — rơi về Tìm nếu tab cũ không còn hợp lệ.
  const effectiveTab = room.isDM && (activeTab === 'members' || activeTab === 'permissions') ? 'search' : activeTab;
  const swipeStart = useRef(null);

  const handleSwipeStart = (event) => {
    event.stopPropagation();
    if (window.innerWidth >= 768) return;
    if (event.target.closest?.('button, input, textarea, select, a')) return;
    const touch = event.touches[0];
    if (touch.clientX <= 24) swipeStart.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleSwipeEnd = (event) => {
    event.stopPropagation();
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const touch = event.changedTouches[0];
    const horizontal = touch.clientX - start.x;
    const vertical = touch.clientY - start.y;
    if (horizontal > 72 && horizontal > Math.abs(vertical)) onClose();
  };

  // 1 dòng thành viên, dùng chung cho danh sách trực tuyến/ngoại tuyến/ẩn trạng thái.
  const renderMemberRow = (m, status) => {
    const offline = status === 'offline';
    const memberIsOwner = ownerId === m._id?.toString();
    const memberIsAdmin = !memberIsOwner && admins.includes(m._id?.toString());
    const canKick = isAdmin && !memberIsOwner && m._id !== user._id && (isOwner || !memberIsAdmin);

    return (
      <li key={m._id} className={offline ? 'opacity-70 hover:opacity-100' : ''}>
        <a onClick={() => onViewProfile && onViewProfile(m._id)} className="group">
          <div className={`avatar ${status === 'online' ? 'avatar-online' : status === 'offline' ? 'avatar-offline' : ''}`}>
            <div className="w-8 rounded-full">
              {m.avatar ? (
                <img src={m.avatar} alt="avatar" className={offline ? 'grayscale' : ''} />
              ) : (
                <div className={`w-full h-full flex items-center justify-center font-bold text-sm ${offline ? 'bg-base-300 text-base-content' : 'bg-primary text-primary-content'}`}>
                  {(m.nickname || m.username)[0].toUpperCase()}
                </div>
              )}
            </div>
          </div>
          <span className="text-sm font-semibold truncate group-hover:text-primary transition-colors flex-1 flex items-center gap-1">
            {m.nickname || m.username}
            {memberIsOwner && (
              <span className="text-[9px] font-bold text-warning bg-warning/10 px-1.5 py-0.5 rounded-full flex-shrink-0 normal-case">Chủ phòng</span>
            )}
            {memberIsAdmin && (
              <span className="text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full flex-shrink-0 normal-case">Quản trị viên</span>
            )}
          </span>

          {canKick && (
            <Button
              onClick={(e) => { e.stopPropagation(); setConfirmAction({ type: 'kick', memberId: m._id, memberName: m.nickname || m.username }); }}
              className="btn-2xs !text-error opacity-0 group-hover:opacity-100"
              title="Xóa khỏi nhóm"
            >
              <UserX className="w-3.5 h-3.5" />
            </Button>
          )}
        </a>
      </li>
    );
  };

  return (
    <div
      style={{ '--room-drawer-width': `${drawerWidth}px` }}
      onTouchStart={handleSwipeStart}
      onTouchEnd={handleSwipeEnd}
      className="fixed inset-0 z-40 w-full md:static md:inset-auto md:z-auto md:w-[var(--room-drawer-width)] bg-base-100 flex flex-col flex-shrink-0"
    >
      <div className="min-h-[60px] border-b border-base-300 px-4 flex items-center justify-between font-bold select-none flex-shrink-0 text-sm">
        Thông tin chi tiết
        <Button onClick={onClose} size="sm" circle className="md:hidden" title="Đóng">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto hide-scrollbar p-4 flex flex-col items-center gap-6">
        <div
          className={`flex flex-col items-center gap-2 mt-4 text-center ${room.isDM && dmPartner && onViewProfile ? 'cursor-pointer group' : ''}`}
          onClick={() => {
            if (room.isDM && dmPartner && onViewProfile) {
              onViewProfile(dmPartner._id);
            }
          }}
        >
          {room.isDM ? (
            <div className="avatar">
              <div className="w-20 rounded-full ring-2 ring-base-300 group-hover:ring-primary transition-all">
                {dmPartner?.avatar ? (
                  <img src={dmPartner.avatar} alt="avatar" />
                ) : (
                  <div className="w-full h-full bg-primary flex items-center justify-center text-primary-content font-bold text-3xl">
                    {displayName[0].toUpperCase()}
                  </div>
                )}
              </div>
            </div>
          ) : roomAvatar ? (
            <div className="avatar">
              <div className="w-20 rounded-full ring-2 ring-base-300">
                <img src={roomAvatar} alt="avatar phòng" />
              </div>
            </div>
          ) : (
            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-primary to-secondary text-primary-content flex items-center justify-center">
              <HugeiconsIcon icon={MessageCircleIcon} size={36} strokeWidth={1.8} />
            </div>
          )}
          <div className="flex items-center gap-1.5 mt-2">
            <span className="font-bold text-lg group-hover:text-primary transition-colors">{displayName}</span>
            {!room.isDM && isOwner && (
              <Button
                onClick={(e) => { e.stopPropagation(); onOpenSettings(); }}
                size="xs" circle className="!text-base-content/50"
                title="Đổi tên / công khai-riêng tư"
              >
                <Pencil className="w-3 h-3" />
              </Button>
            )}
          </div>
          {!room.isDM && (
            <span className="text-[11px] text-base-content/40">
              {roomIsPrivate ? 'Phòng riêng tư' : 'Phòng công khai'}
            </span>
          )}
          {room.isDM && (
            <span className="text-xs text-base-content/50">
              {dmPartnerOnline === null ? 'Ẩn trạng thái hoạt động' : dmPartnerOnline ? 'Đang hoạt động' : 'Không hoạt động'}
            </span>
          )}
        </div>

        <Button
          onClick={onOpenBackground}
          size="sm" className="bg-base-200 gap-1.5 normal-case w-full"
        >
          <Palette className="w-3.5 h-3.5" /> Đổi chủ đề
        </Button>

        {room.isDM && dmPartner && blockedByMe !== undefined && (
          <BlockUserButton userId={dmPartner._id} displayName={displayName}
            blocked={blockedByMe} className="w-full" />
        )}

        <div className="divider my-0 w-full" />

        {/* Mời/Xoay khóa/Yêu cầu tham gia — chỉ áp dụng phòng nhóm */}
        {!room.isDM && (
          <div className="w-full flex flex-col gap-4">
            <div className="flex items-center gap-1 px-1 min-w-0">
              <h4 className="min-w-0 flex-1 truncate text-xs font-bold text-base-content/50 uppercase tracking-wider">
                Thành viên nhóm ({roomMembers?.length || 0})
              </h4>
              <div className="flex min-w-0 flex-1 items-center gap-1">
                {isOwner && (
                  <Button
                    onClick={onOpenInvite}
                    size="xs" className="!text-primary gap-1 normal-case flex-none"
                    title="Mời qua link hoặc mã QR"
                  >
                    <Link2 className="w-3 h-3" /> Mời
                  </Button>
                )}
                <Button
                  onClick={onRotateKey}
                  size="xs" className="!text-primary gap-1 normal-case min-w-0 flex-1"
                  title="Tạo lại khóa mã hóa nhóm — dùng khi nghi ngờ 1 thiết bị trong nhóm bị lộ"
                >
                  <RotateCw className="w-3 h-3 flex-none" /> <span className="truncate">Xoay khóa</span>
                </Button>
              </div>
            </div>

            {isAdmin && (
              <div className="w-full">
                <Button
                  onClick={onToggleJoinRequests}
                  size="xs" className="!text-warning gap-1 normal-case w-full justify-start px-1"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Yêu cầu tham gia {joinRequests.length > 0 && `(${joinRequests.length})`}
                </Button>
                {showJoinRequests && (
                  <ul className="menu menu-sm p-0 gap-1 mt-1">
                    {joinRequests.length === 0 && (
                      <li className="text-[11px] text-base-content/40 italic px-2 py-1">Không có yêu cầu nào</li>
                    )}
                    {joinRequests.map(r => (
                      <li key={r._id}>
                        <div className="flex items-center gap-2">
                          <span className="text-sm flex-1 truncate">{r.nickname || r.username}</span>
                          <Button
                            onClick={() => onApproveRequest(r._id)}
                            className="btn-2xs !text-success"
                            title="Duyệt"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            onClick={() => onRejectRequest(r._id)}
                            className="btn-2xs !text-error"
                            title="Từ chối"
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="divider my-1" />
              </div>
            )}
          </div>
        )}

        {/* Tìm/Kho lưu trữ — chung DM và nhóm; Thành viên/Quản lý quyền chỉ nhóm */}
        <div className="w-full flex flex-col gap-4">
          <div className="tabs tabs-boxed tabs-sm bg-base-200/50 w-full">
            <a className={`tab ${effectiveTab === 'search' ? 'tab-active' : ''}`} onClick={() => setActiveTab('search')}>
              <HugeiconsIcon icon={Search01Icon} size={14} /> Tìm
            </a>
            <a className={`tab gap-1 ${effectiveTab === 'gallery' ? 'tab-active' : ''}`} onClick={() => setActiveTab('gallery')}>
              <HugeiconsIcon icon={Image02Icon} size={14} /> Kho lưu trữ
            </a>
            {!room.isDM && (
              <a className={`tab ${effectiveTab === 'members' ? 'tab-active' : ''}`} onClick={() => setActiveTab('members')}>
                Thành viên
              </a>
            )}
            {!room.isDM && isOwner && (
              <a className={`tab gap-1 ${effectiveTab === 'permissions' ? 'tab-active' : ''}`} onClick={() => setActiveTab('permissions')}>
                <KeyRound className="w-3.5 h-3.5" /> Quản lý quyền
              </a>
            )}
          </div>

          {effectiveTab === 'search' && (
            <SearchBar
              messages={messages || []}
              roomMembers={roomMembers || []}
              hasMore={hasMore}
              loadMore={loadMore}
              onSelectMessage={(msgId) => {
                onSelectMessage?.(msgId);
                setActiveTab(room.isDM ? 'search' : 'members');
              }}
              onClose={() => setActiveTab(room.isDM ? 'search' : 'members')}
            />
          )}

          {effectiveTab === 'gallery' && (
            <MediaGalleryTab
              room={room}
              active={effectiveTab === 'gallery'}
              onSelectMessage={(msgId) => {
                onSelectMessage?.(msgId);
              }}
            />
          )}

          {effectiveTab === 'permissions' && !room.isDM && isOwner && (
            <RoomPermissionsTab
              roomMembers={roomMembers}
              ownerId={ownerId}
              admins={admins}
              grantedPermissions={grantedPermissions}
              user={user}
              setConfirmAction={setConfirmAction}
            />
          )}

          {effectiveTab === 'members' && !room.isDM && (
            <ul className="menu menu-sm p-0 gap-1 max-h-64 overflow-y-auto hide-scrollbar flex-nowrap">
              {onlineMembers.map(m => renderMemberRow(m, 'online'))}
              {(hiddenStatusMembers || []).map(m => renderMemberRow(m, 'hidden'))}
              {offlineMembers.map(m => renderMemberRow(m, 'offline'))}
            </ul>
          )}
        </div>

        {/* Rời nhóm/Hủy phòng — chỉ áp dụng phòng nhóm */}
        {!room.isDM && (
          <div className="w-full flex flex-col gap-4">
            <Button
              onClick={onLeaveClick}
              variant="soft-error" size="sm" className="gap-1.5 w-full"
            >
              <LogOut className="w-4 h-4" /> Rời nhóm
            </Button>

            {isOwner && (
              <Button
                onClick={() => setConfirmAction({ type: 'delete-room' })}
                variant="error" size="sm" className="gap-1.5 w-full"
              >
                <Trash2 className="w-4 h-4" /> Hủy phòng
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
