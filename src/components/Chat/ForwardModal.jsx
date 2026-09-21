import { useState, useEffect } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { getMyRooms } from '../../api/rooms.api';
import { useAuth } from '../../context/AuthContext';

export default function ForwardModal({ isOpen, onClose, messageToForward, onForward }) {
  const { user } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [search, setSearch] = useState('');
  const [forwardedRoomIds, setForwardedRoomIds] = useState(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        setLoading(true);
        getMyRooms()
          .then(rooms => {
            setRooms(rooms);
            setForwardedRoomIds(new Set());
          })
          .catch(err => console.error('Lỗi khi tải danh sách phòng:', err))
          .finally(() => setLoading(false));
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && messageToForward?.isDeleted) {
      onClose();
    }
  }, [isOpen, messageToForward?.isDeleted, onClose]);

  if (!isOpen) return null;

  const getRoomName = (room) => {
    if (room.isDM) {
      const partner = room.members?.find(m => m._id?.toString() !== user._id?.toString());
      return partner?.nickname || partner?.username || 'Người dùng';
    }
    return room.name;
  };

  const filteredRooms = rooms.filter(room => {
    const name = getRoomName(room).toLowerCase();
    return name.includes(search.toLowerCase());
  });

  const handleForwardClick = (roomId) => {
    onForward(roomId, messageToForward);
    setForwardedRoomIds(prev => {
      const next = new Set(prev);
      next.add(roomId);
      return next;
    });
  };

  return (
    <Modal boxClassName="p-0 w-full max-w-sm rounded-2xl shadow-2xl flex flex-col max-h-[450px] overflow-hidden border border-base-300">

        <div className="flex justify-between items-center px-4 py-3.5 border-b border-base-300">
          <h3 className="font-bold text-sm">Chuyển tiếp tin nhắn</h3>
          <Button onClick={onClose} size="xs" circle aria-label="Đóng">
            <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.8} />
          </Button>
        </div>

        <div className="px-4 py-2.5 border-b border-base-300">
          <input
            type="text"
            placeholder="Tìm kiếm cuộc trò chuyện..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input input-bordered input-sm w-full text-xs"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-1">
          {loading ? (
            <div className="flex justify-center items-center py-8 text-xs text-base-content/50">
              Đang tải danh sách...
            </div>
          ) : filteredRooms.length === 0 ? (
            <div className="flex justify-center items-center py-8 text-xs text-base-content/50">
              Không tìm thấy cuộc trò chuyện nào
            </div>
          ) : (
            <div className="divide-y divide-base-200">
              {filteredRooms.map(room => {
                const roomName = getRoomName(room);
                const hasSent = forwardedRoomIds.has(room._id);

                return (
                  <div key={room._id} className="flex justify-between items-center py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="avatar placeholder flex-shrink-0">
                        <div className="bg-primary/10 text-primary rounded-full w-8">
                          {room.isDM ? (
                            room.members?.find(m => m._id?.toString() !== user._id?.toString())?.avatar ? (
                              <img
                                src={room.members.find(m => m._id?.toString() !== user._id?.toString()).avatar}
                                alt="avatar"
                                className="rounded-full"
                              />
                            ) : (
                              <span className="text-xs font-bold">{roomName[0].toUpperCase()}</span>
                            )
                          ) : (
                            <span className="text-xs">👥</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-xs font-semibold truncate">{roomName}</span>
                        <span className="text-[9px] text-base-content/50">
                          {room.isDM ? 'Trò chuyện cá nhân' : 'Nhóm'}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleForwardClick(room._id)}
                      disabled={hasSent}
                      className={`btn btn-xs rounded-full font-bold ${
                        hasSent
                          ? 'btn-success btn-outline cursor-default'
                          : 'btn-primary text-white'
                      }`}
                    >
                      {hasSent ? <span className="inline-flex items-center gap-1"><HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} strokeWidth={1.8} />Đã gửi</span> : 'Gửi'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-4 py-2.5 bg-base-200 border-t border-base-300 flex justify-end">
          <Button onClick={onClose} size="xs" className="bg-base-100">
            Đóng
          </Button>
        </div>

    </Modal>
  );
}
