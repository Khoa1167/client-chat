import { ArrowLeft, Phone, Video, Info } from '../icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { MessageCircleIcon } from '@hugeicons/core-free-icons';
import Button from '../common/Button';

export default function ChatHeader({
  room, dmPartner, dmPartnerOnline, roomAvatar, displayName, roomMembers,
  showMembers, onToggleMembers, onCloseChat, onBackToFriends, onInitiateCall, onInitiateGroupCall, onViewProfile, canContactDm,
}) {
  return (
    <div className="min-h-[60px] border-b border-base-300 px-4 flex items-center justify-between bg-base-100 flex-shrink-0 z-10">
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile: quay lại danh sách phòng (Sidebar), ở lại tab hiện tại — khác nút desktop bên
            dưới (nhảy thẳng sang tab Bạn bè, hành vi có chủ đích sẵn có, không đổi). */}
        <Button
          onClick={onCloseChat}
          size="sm" circle className="bg-base-200 md:hidden"
          title="Quay lại danh sách chat"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Button
          onClick={onBackToFriends}
          size="sm" circle className="hidden md:inline-flex bg-base-200"
          title="Quay lại danh sách bạn bè"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>

        {/* Avatar Header & Tên */}
        <div
          className={`flex items-center gap-3 min-w-0 ${room.isDM && dmPartner && onViewProfile ? 'cursor-pointer group' : ''}`}
          onClick={() => {
            if (room.isDM && dmPartner && onViewProfile) {
              onViewProfile(dmPartner._id);
            }
          }}
        >
          {room.isDM ? (
            <div className={`avatar ${dmPartnerOnline === null ? '' : dmPartnerOnline ? 'avatar-online' : 'avatar-offline'} flex-shrink-0`}>
              <div className="w-10 rounded-full ring-1 ring-base-300 group-hover:ring-primary transition-all">
                {dmPartner?.avatar ? (
                  <img src={dmPartner.avatar} alt="avatar" />
                ) : (
                  <div className="w-full h-full bg-primary flex items-center justify-center text-primary-content font-bold">
                    {displayName[0].toUpperCase()}
                  </div>
                )}
              </div>
            </div>
          ) : roomAvatar ? (
            <div className="avatar flex-shrink-0">
              <div className="w-10 rounded-full ring-1 ring-base-300">
                <img src={roomAvatar} alt="avatar phòng" />
              </div>
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-secondary text-primary-content flex items-center justify-center flex-shrink-0">
              <HugeiconsIcon icon={MessageCircleIcon} size={20} strokeWidth={1.8} />
            </div>
          )}

          <div className="flex flex-col leading-tight">
            <span className="font-bold truncate text-[15px] group-hover:text-primary transition-colors">{displayName}</span>
            <span className="text-[11px] text-base-content/50 font-medium">
              {room.isDM
                ? (dmPartnerOnline === null ? 'Ẩn trạng thái hoạt động' : dmPartnerOnline ? 'Đang hoạt động' : 'Không hoạt động')
                : `${roomMembers?.length || 0} thành viên`
              }
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Nút gọi thoại 1-1 (Xem mã an toàn E2EE đã chuyển vào Trang cá nhân) */}
        {room.isDM && dmPartner && canContactDm && (
          <>
            <Button
              onClick={() => onInitiateCall && onInitiateCall(dmPartner, 'audio')}
              size="sm" circle className="!text-primary"
              title="Bắt đầu cuộc gọi thoại"
            >
              <Phone className="w-[18px] h-[18px]" />
            </Button>
            <Button
              onClick={() => onInitiateCall(dmPartner, 'video')}
              size="sm" circle
              title="Gọi video"
            >
              <Video className="w-[18px] h-[18px]" />
            </Button>
          </>
        )}

        {!room.isDM && onInitiateGroupCall && (
          <>
            <Button
              onClick={() => onInitiateGroupCall(room, roomMembers, 'audio')}
              size="sm" circle className="!text-primary"
              title="Bắt đầu cuộc gọi nhóm (thoại)"
            >
              <Phone className="w-[18px] h-[18px]" />
            </Button>
            <Button
              onClick={() => onInitiateGroupCall(room, roomMembers, 'video')}
              size="sm" circle
              title="Gọi video nhóm"
            >
              <Video className="w-[18px] h-[18px]" />
            </Button>
          </>
        )}

        <Button
          onClick={onToggleMembers}
          size="sm" circle className={showMembers ? 'bg-primary/10 !text-primary' : ''}
          title="Thông tin cuộc trò chuyện"
        >
          <Info className="w-[18px] h-[18px]" />
        </Button>
      </div>
    </div>
  );
}
