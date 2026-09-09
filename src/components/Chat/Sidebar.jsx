import { useState, useEffect, useRef } from 'react';
import { Search, Plus, QrCode } from '../icons';
import QRScannerModal from './QRScannerModal';
import Tabs from '../common/Tabs';
import Button from '../common/Button';
import { toast } from '../common/toastStore';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../hooks/useSocket';
import {
  getSenderKeyDoc, getMyRooms,
  createRoom as createRoomApi,
} from '../../api/rooms.api';
import { getFriends, getDmRoom } from '../../api/friends.api';
import {
  decryptMessage, getDeviceId, getPrivateKey, getHistoryKey, listHistoryKeyIds,
  unwrapSenderKey, decryptWithSenderKey, storeSenderKey, getSenderKey,
} from '../../crypto';

const getDMPartner = (room, currentUser) => {
  if (!room?.isDM || !room?.members) return null;
  return room.members.find(m => m._id?.toString() !== currentUser._id?.toString());
};

// Giải mã tin nhắn preview (lastMessage) — tự nhận diện scheme (RSA-per-device cũ/DM, hay Sender
// Key cho nhóm). Trùng lặp có chủ đích với ChatWindow.jsx (Sidebar vốn đã tự giải mã riêng).
const decryptRoomMessage = async (msg, roomId) => {
  const devId = getDeviceId();
  if (msg.scheme !== 'sender-key') {
    return decryptMessage(msg, devId);
  }

  try {
    let senderKey = await getSenderKey(roomId, msg.senderDeviceId, msg.epoch);
    if (!senderKey) {
      const dist = await getSenderKeyDoc(roomId, { epoch: msg.epoch, senderDeviceId: msg.senderDeviceId });
      for (const keyId of [devId, ...listHistoryKeyIds()]) {
        const wrapped = dist.encryptedKeys?.[keyId];
        if (!wrapped) continue;
        const privateKey = keyId === devId ? await getPrivateKey(keyId) : await getHistoryKey(keyId);
        if (!privateKey) continue;
        senderKey = await unwrapSenderKey(wrapped, privateKey);
        await storeSenderKey(roomId, msg.senderDeviceId, msg.epoch, senderKey);
        break;
      }
      if (!senderKey) return '[Không thể giải mã tin nhắn — Thiết bị này chưa được phân phối Sender Key]';
    }
    return decryptWithSenderKey(msg, senderKey);
  } catch (err) {
    console.error('[E2EE] Sender Key fetch error:', err);
    return '[Không thể giải mã tin nhắn — Chưa có Sender Key]';
  }
};

export default function Sidebar({ activeRoom, onSelectRoom }) {
  const { user }             = useAuth();
  const { on, emit }        = useSocket();
  const [rooms, setRooms]   = useState([]);
  // Đọc trong socket handler (deps [on], không rerun khi activeRoom đổi) — ref tránh closure cũ.
  const activeRoomIdRef = useRef(activeRoom?._id);
  useEffect(() => { activeRoomIdRef.current = activeRoom?._id; }, [activeRoom]);
  const [showCreate, setShowCreate] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomIsPublic, setNewRoomIsPublic] = useState(false);
  const [newRoomNeedsApproval, setNewRoomNeedsApproval] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [createError, setCreateError] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'dm' | 'group'
  // Danh sách bạn bè để gộp vào ô tìm kiếm (tìm cả bạn chưa từng nhắn tin) — không cần realtime.
  const [friends, setFriends] = useState([]);

  useEffect(() => {
    getFriends().then(setFriends).catch(() => {});
  }, []);

  useEffect(() => {
    getMyRooms().then(async rooms => {
      const decryptedRooms = await Promise.all(
        rooms.map(async room => {
          const lastMsg = room.lastMessage;
          if (!lastMsg || lastMsg.isDeleted || (!lastMsg.encryptedKeys && lastMsg.scheme !== 'sender-key')) return room;
          const decryptedText = await decryptRoomMessage(lastMsg, room._id);
          return { ...room, lastMessage: { ...lastMsg, content: decryptedText } };
        })
      );
      setRooms(decryptedRooms);
    }).catch(err => {
      console.error('Lỗi khi tải danh sách phòng:', err);
      toast.error('Không thể tải danh sách phòng chat');
    });
  }, []);

  useEffect(() => {
    const off = on('room:added', (room) => {
      setRooms(prev => {
        const exists = prev.find(r => r._id === room._id);
        if (exists) return prev;
        return [room, ...prev];
      });
    });
    return off;
  }, [on]);

  useEffect(() => {
    const off = on('user:online', ({ userId }) => {
      setRooms(prev => prev.map(r => ({
        ...r,
        members: r.members?.map(m =>
          m._id?.toString() === userId?.toString()
            ? { ...m, isOnline: true }
            : m
        )
      })));
    });
    return off;
  }, [on]);

  useEffect(() => {
    const off = on('user:offline', ({ userId }) => {
      setRooms(prev => prev.map(r => ({
        ...r,
        members: r.members?.map(m =>
          m._id?.toString() === userId?.toString()
            ? { ...m, isOnline: false }
            : m
        )
      })));
    });
    return off;
  }, [on]);

  // Mình vừa rời nhóm hoặc bị kick — bỏ phòng đó khỏi danh sách
  useEffect(() => {
    const off = on('room:removed', ({ roomId }) => {
      setRooms(prev => prev.filter(r => r._id !== roomId));
    });
    return off;
  }, [on]);

  // Người khác rời/bị kick khỏi 1 nhóm mình đang ở — cập nhật danh sách thành viên
  useEffect(() => {
    const off = on('room:member_left', ({ roomId, userId }) => {
      setRooms(prev => prev.map(r => r._id === roomId
        ? { ...r, members: r.members?.filter(m => m._id?.toString() !== userId?.toString()) }
        : r
      ));
    });
    return off;
  }, [on]);

  // Có người mới vào nhóm — cập nhật danh sách thành viên, không thì ChatWindow mở sau sẽ thiếu người mới.
  useEffect(() => {
    const off = on('room:member_joined', ({ roomId, member }) => {
      setRooms(prev => prev.map(r => r._id === roomId
        ? { ...r, members: r.members?.some(m => m._id === member._id) ? r.members : [...(r.members || []), member] }
        : r
      ));
    });
    return off;
  }, [on]);

  // Cập nhật tin nhắn cuối khi có tin nhắn mới, bị xóa hoặc chỉnh sửa
  useEffect(() => {
    const offNew = on('message:new', async (msg) => {
      const decryptedText = msg.isDeleted ? msg.content : await decryptRoomMessage(msg, msg.room);
      const decryptedMsg = { ...msg, content: decryptedText };
      const isOwn = msg.sender?._id?.toString() === user._id?.toString();
      const isOpenRoom = activeRoomIdRef.current === msg.room;
      setRooms(prev =>
        prev.map(r => r._id === msg.room
          ? { ...r, lastMessage: decryptedMsg, updatedAt: msg.createdAt,
              unreadCount: (isOwn || isOpenRoom) ? 0 : (r.unreadCount || 0) + 1 }
          : r
        ).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      );
    });

    const offDeleted = on('message:deleted', ({ messageId }) => {
      setRooms(prev =>
        prev.map(r => r.lastMessage?._id === messageId
          ? { ...r, lastMessage: { ...r.lastMessage, isDeleted: true } }
          : r
        )
      );
    });

    const offEdited = on('message:edited', ({ messageId, content, iv, tag, encryptedKeys, scheme, senderDeviceId, epoch, isEdited }) => {
      setRooms(prev => {
        const targetRoom = prev.find(r => r.lastMessage?._id === messageId);
        if (!targetRoom) return prev;
        // roomId chỉ suy ra được từ state hiện có (payload message:edited không kèm roomId) —
        // giải mã xong mới cập nhật state ở lần setRooms thứ 2, lần này giữ nguyên state cũ.
        decryptRoomMessage({ content, iv, tag, encryptedKeys, scheme, senderDeviceId, epoch }, targetRoom._id)
          .then(decryptedText => {
            setRooms(cur => cur.map(r => r.lastMessage?._id === messageId
              ? { ...r, lastMessage: { ...r.lastMessage, content: decryptedText, isEdited, iv, tag, encryptedKeys, scheme, senderDeviceId, epoch } }
              : r
            ));
          });
        return prev;
      });
    });

    // Tắt chấm "chưa đọc" khi CHÍNH mình đã giải mã xong (server echo lại room:read của chính mình)
    // — không tắt ngay lúc bấm vào phòng, vì lúc đó chưa chắc đã đọc được nội dung.
    const offRead = on('room:read', ({ roomId, userId: readerId }) => {
      if (readerId === user._id?.toString()) {
        setRooms(prev => prev.map(r => r._id === roomId ? { ...r, unreadCount: 0 } : r));
      }
    });

    return () => {
      offNew();
      offDeleted();
      offEdited();
      offRead();
    };
  }, [on, user]);

  const createRoom = async (e) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    setCreateError('');
    try {
      const data = await createRoomApi({
        name: newRoomName,
        isPrivate: !newRoomIsPublic,
        joinPolicy: newRoomIsPublic && newRoomNeedsApproval ? 'approval' : 'open',
      });
      setRooms(prev => prev.find(r => r._id === data._id) ? prev : [data, ...prev]);
      setNewRoomName('');
      setNewRoomIsPublic(false);
      setNewRoomNeedsApproval(false);
      setShowCreate(false);
      onSelectRoom(data);
      emit('room:join', data._id);
    } catch (err) {
      setCreateError(err.response?.data?.message || 'Tạo phòng thất bại');
    }
  };

  // Bạn bè khớp searchQuery nhưng chưa có phòng DM trong danh sách rooms (tránh hiện trùng người ở cả 2 nhóm kết quả).
  const existingDmPartnerIds = new Set(
    rooms.filter(r => r.isDM).map(r => getDMPartner(r, user)?._id?.toString()).filter(Boolean)
  );
  const friendMatches = searchQuery.trim() && filterType !== 'group'
    ? friends
        .map(f => f.sender?._id?.toString() === user._id?.toString() ? f.receiver : f.sender)
        .filter(friend => friend?._id && !existingDmPartnerIds.has(friend._id.toString()))
        .filter(friend => (friend.nickname || '').toLowerCase().includes(searchQuery.toLowerCase()))
    : [];

  const openFriendDM = async (friendId) => {
    try {
      const data = await getDmRoom(friendId);
      setRooms(prev => prev.find(r => r._id === data._id) ? prev : [data, ...prev]);
      onSelectRoom(data);
      setSearchQuery('');
    } catch (err) {
      console.error(err);
      toast.error('Không thể mở đoạn chat với người này');
    }
  };

  return (
    <div className="flex flex-col h-full bg-base-100 text-base-content font-sans select-none">
      {/* Header Chats */}
      <div className="p-4 pb-2 flex flex-col gap-3 flex-shrink-0">
        <Tabs
          className="w-fit"
          active={filterType}
          onChange={setFilterType}
          tabs={[
            { key: 'all', label: 'Tất cả' },
            { key: 'dm', label: 'Riêng tư' },
            { key: 'group', label: 'Nhóm' },
          ]}
        />

        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black tracking-tight">Đoạn chat</h1>

          <div className="flex gap-2">
            <Button
              onClick={() => setShowScanner(true)}
              className="btn-circle btn-sm bg-base-200"
              title="Quét mã QR mời vào nhóm"
            >
              <QrCode className="w-4 h-4" />
            </Button>
            <Button
              onClick={() => setShowCreate(!showCreate)}
              className="btn-circle btn-sm bg-base-200"
              title="Tạo phòng chat mới"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <label className="input input-bordered rounded-full flex items-center gap-2 bg-base-200 border-none text-xs">
          <Search className="w-3.5 h-3.5 opacity-50" />
          <input
            className="grow"
            placeholder="Tìm kiếm cuộc trò chuyện"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </label>
      </div>

      {/* Vùng cuộn danh sách phòng & bạn bè */}
      <div className="flex-1 overflow-y-auto hide-scrollbar px-3 py-1 flex flex-col gap-1">

        {/* Form tạo phòng */}
        {showCreate && (
          <div className="mb-2 bg-base-200/50 rounded-xl p-2.5 flex flex-col gap-2">
            <form onSubmit={createRoom} className="join w-full">
              <input
                value={newRoomName}
                onChange={e => setNewRoomName(e.target.value)}
                placeholder="Tên phòng mới..."
                className="input input-bordered input-sm join-item w-full bg-base-100"
                autoFocus
              />
              <Button type="submit" variant="primary" className="btn-sm join-item">Tạo</Button>
            </form>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" className="checkbox checkbox-xs" checked={newRoomIsPublic} onChange={e => setNewRoomIsPublic(e.target.checked)} />
              Phòng công khai
            </label>
            {newRoomIsPublic && (
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" className="checkbox checkbox-xs" checked={newRoomNeedsApproval} onChange={e => setNewRoomNeedsApproval(e.target.checked)} />
                Cần duyệt khi có người xin vào
              </label>
            )}
            {createError && <p className="text-error text-[11px]">{createError}</p>}
          </div>
        )}

        <h2 className="text-xs font-bold text-base-content/40 uppercase tracking-wider px-3 pt-1 pb-1">Gần đây</h2>
        <ul className="menu menu-lg p-0 gap-1 flex-nowrap">
          {rooms.length === 0 && (
            <p className="text-xs text-center text-base-content/50 py-8 px-3 italic">
              Chưa có cuộc trò chuyện nào. Hãy tạo phòng mới!
            </p>
          )}
          {rooms
            .filter(room => {
              if (filterType === 'dm' && !room.isDM) return false;
              if (filterType === 'group' && room.isDM) return false;
              const dmPartner = getDMPartner(room, user);
              const displayName = room.isDM
                ? (dmPartner?.nickname || 'Người dùng')
                : room.name;
              return displayName.toLowerCase().includes(searchQuery.toLowerCase());
            })
            .map(room => {
            const dmPartner = getDMPartner(room, user);
            const displayName = room.isDM
              ? (dmPartner?.nickname || 'Người dùng')
              : room.name;

            const isActive = activeRoom?._id === room._id;
            const lastMsg = room.lastMessage;

            return (
              <li key={room._id}>
                <a
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${isActive ? 'active font-semibold' : ''}`}
                  onClick={() => onSelectRoom(room)}
                >
                  {room.isDM ? (
                    <div className={`avatar ${dmPartner?.isOnline === null ? '' : dmPartner?.isOnline ? 'avatar-online' : 'avatar-offline'} flex-shrink-0`}>
                      <div className="w-11 rounded-full ring-1 ring-base-300">
                        {dmPartner?.avatar ? (
                          <img src={dmPartner.avatar} alt="avatar" />
                        ) : (
                          <div className="w-full h-full bg-primary flex items-center justify-center text-primary-content font-bold text-base">
                            {displayName[0].toUpperCase()}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : room.avatar ? (
                    <div className="avatar flex-shrink-0">
                      <div className="w-11 rounded-full ring-1 ring-base-300">
                        <img src={room.avatar} alt="avatar phòng" />
                      </div>
                    </div>
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-primary to-secondary text-primary-content flex items-center justify-center font-bold text-base flex-shrink-0">
                      💬
                    </div>
                  )}

                  <div className="flex-1 min-w-0 flex flex-col leading-tight">
                    <span className={`text-[14px] truncate ${room.unreadCount > 0 ? 'font-bold' : 'font-semibold'}`}>{displayName}</span>
                    <span className={`text-xs truncate mt-0.5 ${room.unreadCount > 0 ? 'font-semibold text-base-content' : 'text-base-content/60'}`}>
                      {lastMsg ? (
                        <>
                          <span className="font-medium mr-1">
                            {lastMsg.sender?._id?.toString() === user._id?.toString() ? 'Bạn:' : `${lastMsg.sender?.nickname || lastMsg.sender?.username}:`}
                          </span>
                          {lastMsg.isDeleted ? 'Tin nhắn đã bị thu hồi' : (
                            lastMsg.type === 'image' ? '[Hình ảnh]' :
                            lastMsg.type === 'audio' ? '[Tin nhắn thoại]' :
                            lastMsg.type === 'file' ? `[Tệp: ${lastMsg.fileName || 'Tài liệu'}]` :
                            lastMsg.content
                          )}
                        </>
                      ) : (
                        'Chưa có tin nhắn nào'
                      )}
                    </span>
                  </div>

                  {room.unreadCount > 0 && (
                    <span className="badge badge-primary badge-sm flex-shrink-0">
                      {room.unreadCount > 99 ? '99+' : room.unreadCount}
                    </span>
                  )}
                </a>
              </li>
            );
          })}
        </ul>

        {/* Bạn bè khớp tìm kiếm nhưng chưa từng nhắn tin — bấm vào tự tạo/mở DM. Chỉ hiện khi
            đang gõ tìm kiếm, không chiếm chỗ lúc bình thường. */}
        {friendMatches.length > 0 && (
          <>
            <h2 className="text-xs font-bold text-base-content/40 uppercase tracking-wider px-3 pt-2 pb-1">Bạn bè</h2>
            <ul className="menu menu-lg p-0 gap-1 flex-nowrap">
              {friendMatches.map(friend => (
                <li key={friend._id}>
                  <a className="flex items-center gap-3 px-3 py-2.5 rounded-xl" onClick={() => openFriendDM(friend._id)}>
                    <div className={`avatar ${friend.isOnline === null ? '' : friend.isOnline ? 'avatar-online' : 'avatar-offline'} flex-shrink-0`}>
                      <div className="w-11 rounded-full ring-1 ring-base-300">
                        {friend.avatar ? (
                          <img src={friend.avatar} alt="avatar" />
                        ) : (
                          <div className="w-full h-full bg-primary flex items-center justify-center text-primary-content font-bold text-base">
                            {(friend.nickname || '?')[0].toUpperCase()}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col leading-tight">
                      <span className="text-[14px] font-semibold truncate">{friend.nickname || 'Người dùng'}</span>
                      <span className="text-xs text-base-content/40 truncate mt-0.5">Bắt đầu nhắn tin</span>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {showScanner && <QRScannerModal onClose={() => setShowScanner(false)} />}
    </div>
  );
}
