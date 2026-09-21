/* eslint-disable no-unused-vars */
import { useState, useEffect, useRef } from 'react';
import Toast from '../common/Toast';
import Tabs from '../common/Tabs';
import Button from '../common/Button';
import { useSocket } from '../../hooks/useSocket';
import { useAuth } from '../../context/AuthContext';
import useTimedMessage from '../../hooks/useTimedMessage';
import {
  getFriends,
  getFriendRequests,
  searchUsers,
  sendFriendRequest,
  cancelFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  getDmRoom,
} from '../../api/friends.api';
import { getMyPendingInvites, acceptRoomInvite, declineRoomInvite } from '../../api/rooms.api';

export default function FriendList({ onSelectDM, onViewProfile }) {
  const { user } = useAuth();
  const { on }                  = useSocket();
  const [friends, setFriends]   = useState([]);
  const [requests, setRequests] = useState([]);
  const [groupInvites, setGroupInvites] = useState([]);
  const [searchQ, setSearchQ]   = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [activeTab, setActiveTab] = useState('friends');
  const [actionError, showActionError] = useTimedMessage();
  const [actionSuccess, showActionSuccess] = useTimedMessage();

  useEffect(() => {
    getFriends().then(data => setFriends(data));
    getFriendRequests().then(data => setRequests(data));
    getMyPendingInvites().then(data => setGroupInvites(data));
  }, []);

  useEffect(() => {
    const off = on('friend:request_received', (friendship) => {
      setRequests(prev => [...prev, friendship]);
    });
    return off;
  }, [on]);

  // Lắng nghe lời mời vào nhóm realtime (admin bấm "Thêm thành viên")
  useEffect(() => {
    const off = on('room:invite_received', ({ roomId, roomName }) => {
      setGroupInvites(prev => prev.some(r => r._id === roomId) ? prev : [...prev, { _id: roomId, name: roomName }]);
    });
    return off;
  }, [on]);

  // Lắng nghe chấp nhận kết bạn realtime — gỡ khỏi tab "Lời mời" nếu action xảy ra từ nơi khác.
  useEffect(() => {
    const off = on('friend:request_accepted', ({ friendshipId }) => {
      setRequests(prev => prev.filter(r => r._id !== friendshipId));
      getFriends().then(data => setFriends(data));
    });
    return off;
  }, [on]);

  // Lắng nghe từ chối/hủy lời mời kết bạn realtime (từ Profile Modal hoặc tab khác)
  useEffect(() => {
    const offRejected = on('friend:request_rejected', ({ friendshipId }) => {
      setRequests(prev => prev.filter(r => r._id !== friendshipId));
    });
    const offCancelled = on('friend:request_cancelled', ({ friendshipId }) => {
      setRequests(prev => prev.filter(r => r._id !== friendshipId));
    });
    return () => { offRejected(); offCancelled(); };
  }, [on]);

  // Lắng nghe hủy kết bạn realtime (từ Profile Modal hoặc tab khác)
  useEffect(() => {
    const off = on('friend:unfriended', ({ friendshipId }) => {
      setFriends(prev => prev.filter(f => f._id !== friendshipId));
    });
    return off;
  }, [on]);

  useEffect(() => {
    const updateFriendOnline = (userId, isOnline) => {
      setFriends(prev => prev.map(f => {
        if (f.sender?._id?.toString() === userId?.toString()) {
          return { ...f, sender: { ...f.sender, isOnline } };
        }
        if (f.receiver?._id?.toString() === userId?.toString()) {
          return { ...f, receiver: { ...f.receiver, isOnline } };
        }
        return f;
      }));
    };
    const offOnline = on('user:online', ({ userId }) => updateFriendOnline(userId, true));
    const offOffline = on('user:offline', ({ userId }) => updateFriendOnline(userId, false));
    return () => { offOnline(); offOffline(); };
  }, [on]);

  // Tìm kiếm debounce 400ms + bỏ qua response đến muộn không còn khớp searchQ hiện tại.
  const latestSearchQRef = useRef('');
  useEffect(() => {
    latestSearchQRef.current = searchQ;
    if (searchQ.trim().length < 2) return;
    const timeout = setTimeout(async () => {
      try {
        const data = await searchUsers(searchQ);
        if (latestSearchQRef.current === searchQ) setSearchResults(data);
      } catch (err) {
        if (latestSearchQRef.current === searchQ) showActionError(err.response?.data?.message || 'Không thể tìm kiếm, thử lại sau');
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [searchQ, showActionError]);

  const handleSearch = (e) => setSearchQ(e.target.value);
  // Query quá ngắn thì ẩn kết quả cũ còn sót lại.
  const shownResults = searchQ.trim().length < 2 ? [] : searchResults;

  const sendRequest = async (userId) => {
    showActionError('');
    try {
      await sendFriendRequest(userId);
      setSearchResults(prev =>
        prev.map(u => u._id === userId ? { ...u, requested: true } : u)
      );
      showActionSuccess('Đã gửi lời mời kết bạn');
    } catch (err) {
      showActionError(err.response?.data?.message || 'Lỗi gửi lời mời');
    }
  };

  // Hủy lời mời đã gửi (tái sử dụng endpoint /friends/cancel đã có, dùng trong OtherUserProfileModal)
  const cancelRequest = async (userId) => {
    showActionError('');
    try {
      await cancelFriendRequest(userId);
      setSearchResults(prev => prev.map(u => u._id === userId ? { ...u, requested: false } : u));
      showActionSuccess('Đã hủy lời mời kết bạn');
    } catch (err) {
      showActionError(err.response?.data?.message || 'Lỗi hủy lời mời');
    }
  };

  const acceptRequest = async (friendship) => {
    showActionError('');
    try {
      await acceptFriendRequest(friendship._id);
      // Join DM room + báo cho người gửi lời mời giờ server tự lo trong route accept ở trên
      // (server verify chắc chắn sender/receiver/dmRoom từ DB — không còn emit chưa xác thực)
      setRequests(prev => prev.filter(r => r._id !== friendship._id));
      getFriends().then(data => setFriends(data));
      showActionSuccess('Kết bạn thành công');
    } catch (err) {
      showActionError(err.response?.data?.message || 'Lỗi chấp nhận lời mời');
    }
  };

  const rejectRequest = async (friendshipId) => {
    showActionError('');
    try {
      await rejectFriendRequest(friendshipId);
      setRequests(prev => prev.filter(r => r._id !== friendshipId));
      showActionSuccess('Đã từ chối lời mời kết bạn');
    } catch (err) {
      showActionError(err.response?.data?.message || 'Lỗi từ chối lời mời');
    }
  };

  // Chấp nhận lời mời vào nhóm (được admin thêm qua "Thêm thành viên")
  const acceptGroupInvite = async (roomId) => {
    showActionError('');
    try {
      await acceptRoomInvite(roomId);
      setGroupInvites(prev => prev.filter(r => r._id !== roomId));
      showActionSuccess('Đã tham gia nhóm');
    } catch (err) {
      showActionError(err.response?.data?.message || 'Lỗi tham gia nhóm');
    }
  };

  const declineGroupInvite = async (roomId) => {
    showActionError('');
    try {
      await declineRoomInvite(roomId);
      setGroupInvites(prev => prev.filter(r => r._id !== roomId));
      showActionSuccess('Đã từ chối lời mời vào nhóm');
    } catch (err) {
      showActionError(err.response?.data?.message || 'Lỗi từ chối lời mời');
    }
  };

  const openDM = async (friendId) => {
    showActionError('');
    try {
      const data = await getDmRoom(friendId);
      onSelectDM(data);
    } catch (err) {
      showActionError('Không tìm thấy phòng DM');
    }
  };

  return (
    <div className="flex flex-col h-full min-w-0 bg-base-100 text-base-content font-sans select-none">
      <div className="border-b border-base-300 px-4 py-3 flex flex-col gap-2 select-none flex-shrink-0 min-w-0">
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xl">👥</span>
          <h1 className="font-black text-xl tracking-tight">Bạn bè</h1>
        </div>

        <Tabs
          className="text-xs gap-1 flex-nowrap overflow-x-auto hide-scrollbar whitespace-nowrap min-w-0 w-fit"
          tabClassName="flex-shrink-0"
          active={activeTab}
          onChange={setActiveTab}
          tabs={[
            { key: 'friends', label: `Tất cả bạn bè ${friends.length > 0 ? `(${friends.length})` : ''}` },
            { key: 'requests', label: `Lời mời kết bạn ${requests.length > 0 ? `(${requests.length})` : ''}` },
            { key: 'groupInvites', label: `Lời mời vào nhóm ${groupInvites.length > 0 ? `(${groupInvites.length})` : ''}` },
            { key: 'search', label: 'Thêm bạn mới', activeClassName: 'tab-active bg-primary text-primary-content', inactiveClassName: 'text-primary' },
          ]}
        />
      </div>

      <Toast message={actionError} type="error" variant="banner" />
      <Toast message={actionSuccess} type="success" variant="banner" />

      {/* Tab: Danh sách bạn bè */}
      {activeTab === 'friends' && (
        <div className="flex-1 overflow-y-auto hide-scrollbar p-6 flex flex-col gap-2">
          <h4 className="text-xs font-bold text-base-content/50 uppercase tracking-wider mb-2 px-1">
            Tất cả bạn bè ({friends.length})
          </h4>
          {friends.length === 0 && (
            <p className="text-sm text-center text-base-content/40 py-12 italic">Chưa có bạn bè nào. Hãy thử kết bạn với những người khác nhé!</p>
          )}
          {friends.map(f => {
            const friend = f.sender?._id?.toString() === user?._id?.toString() ? f.receiver : f.sender;
            return (
              <div key={f._id} className="flex items-center justify-between p-3 rounded-xl hover:bg-base-200 border-b border-base-200 transition-all duration-150 group">
                <div
                  className="flex items-center gap-3 cursor-pointer"
                  onClick={() => onViewProfile && friend?._id && onViewProfile(friend._id)}
                >
                  <div className={`avatar ${friend?.isOnline === null ? '' : friend?.isOnline ? 'avatar-online' : 'avatar-offline'}`}>
                    <div className="w-10 rounded-full ring-1 ring-base-300 group-hover:ring-primary transition-all">
                      {friend?.avatar ? (
                        <img src={friend.avatar} alt="avatar" />
                      ) : (
                        <div className="w-full h-full bg-primary flex items-center justify-center text-primary-content font-bold">
                          {(friend?.nickname || '?')[0].toUpperCase()}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col min-w-0 leading-tight">
                    <span className="text-sm font-bold truncate group-hover:text-primary transition-colors">
                      {friend?.nickname || 'Người dùng'}
                    </span>
                    <span className="text-[11px] text-base-content/40">Xem hồ sơ</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm" pill className="bg-base-200 font-semibold"
                    onClick={() => onViewProfile && friend?._id && onViewProfile(friend._id)}
                  >
                    Hồ sơ
                  </Button>
                  <Button variant="primary" size="sm" pill className="font-bold" onClick={() => openDM(friend?._id)}>
                    Nhắn tin
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab: Lời mời kết bạn */}
      {activeTab === 'requests' && (
        <div className="flex-1 overflow-y-auto hide-scrollbar p-6 flex flex-col gap-2">
          <h4 className="text-xs font-bold text-base-content/50 uppercase tracking-wider mb-2 px-1">
            Yêu cầu kết bạn chờ duyệt ({requests.length})
          </h4>
          {requests.length === 0 && (
            <p className="text-sm text-center text-base-content/40 py-12 italic">Không có lời mời kết bạn nào</p>
          )}
          {requests.map(req => (
            <div key={req._id} className="flex items-center justify-between p-3 rounded-xl hover:bg-base-200 border-b border-base-200 transition-all duration-150 group">
              <div
                className="flex items-center gap-3 cursor-pointer"
                onClick={() => onViewProfile && req.sender?._id && onViewProfile(req.sender._id)}
              >
                <div className="avatar placeholder">
                  <div className="w-10 rounded-full bg-base-200 text-base-content ring-1 ring-transparent group-hover:ring-primary transition-all">
                    {req.sender?.avatar ? (
                      <img src={req.sender.avatar} alt="avatar" />
                    ) : (
                      <span className="font-bold">{(req.sender?.nickname || req.sender?.username || '?')[0].toUpperCase()}</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col min-w-0 leading-tight">
                  <span className="text-sm font-bold truncate group-hover:text-primary transition-colors">
                    {req.sender?.nickname || req.sender?.username}
                  </span>
                  <span className="text-xs text-base-content/50 truncate">Muốn kết nối với bạn</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm" pill className="bg-base-200 font-semibold"
                  onClick={() => onViewProfile && req.sender?._id && onViewProfile(req.sender._id)}
                >
                  Hồ sơ
                </Button>
                <Button variant="success" size="sm" pill className="font-bold" onClick={() => acceptRequest(req)}>Đồng ý</Button>
                <Button variant="error" size="sm" pill className="font-bold" onClick={() => rejectRequest(req._id)}>Từ chối</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Lời mời vào nhóm */}
      {activeTab === 'groupInvites' && (
        <div className="flex-1 overflow-y-auto hide-scrollbar p-6 flex flex-col gap-2">
          <h4 className="text-xs font-bold text-base-content/50 uppercase tracking-wider mb-2 px-1">
            Lời mời vào nhóm ({groupInvites.length})
          </h4>
          {groupInvites.length === 0 && (
            <p className="text-sm text-center text-base-content/40 py-12 italic">Không có lời mời vào nhóm nào</p>
          )}
          {groupInvites.map(r => (
            <div key={r._id} className="flex items-center justify-between p-3 rounded-xl hover:bg-base-200 border-b border-base-200 transition-all duration-150 group">
              <div className="flex items-center gap-3">
                <div className="avatar placeholder">
                  <div className="w-10 rounded-full bg-base-200 text-base-content ring-1 ring-transparent">
                    <span className="font-bold">{(r.name || '?')[0].toUpperCase()}</span>
                  </div>
                </div>
                <div className="flex flex-col min-w-0 leading-tight">
                  <span className="text-sm font-bold truncate">{r.name || 'Nhóm chat'}</span>
                  <span className="text-xs text-base-content/50 truncate">Mời bạn tham gia nhóm</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="success" size="sm" pill className="font-bold" onClick={() => acceptGroupInvite(r._id)}>Đồng ý</Button>
                <Button variant="error" size="sm" pill className="font-bold" onClick={() => declineGroupInvite(r._id)}>Từ chối</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Tìm bạn / Thêm bạn */}
      {activeTab === 'search' && (
        <div className="flex-1 overflow-y-auto hide-scrollbar p-6 flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-bold mb-1">Thêm bạn mới</h3>
            <p className="text-xs text-base-content/50 mb-3">Tìm kiếm bạn bè trên hệ thống.</p>
            <input
              className="input input-bordered rounded-full w-full bg-base-200 border-transparent focus:bg-base-100"
              placeholder="tìm ai đó"
              value={searchQ}
              onChange={handleSearch}
            />
          </div>

          <div className="flex flex-col gap-2 mt-2">
            {shownResults.length === 0 && searchQ.length >= 2 && (
              <p className="text-xs text-center text-base-content/40 py-4 italic">Không tìm thấy người dùng nào</p>
            )}
            {shownResults.map(userItem => (
              <div key={userItem._id} className="flex items-center justify-between p-3 rounded-xl hover:bg-base-200 border-b border-base-200 transition-all duration-150 group">
                <div
                  className="flex items-center gap-3 cursor-pointer"
                  onClick={() => onViewProfile && onViewProfile(userItem._id)}
                >
                  <div className="avatar placeholder">
                    <div className="w-10 rounded-full bg-base-200 text-base-content ring-1 ring-transparent group-hover:ring-primary transition-all">
                      {userItem.avatar ? (
                        <img src={userItem.avatar} alt="avatar" />
                      ) : (
                        <span className="font-bold">{(userItem.nickname || '?')[0].toUpperCase()}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col min-w-0 leading-tight">
                    <span className="text-sm font-bold truncate group-hover:text-primary transition-colors">
                      {userItem.nickname || 'Người dùng'}
                    </span>
                    <span className="text-[11px] text-base-content/40">Xem hồ sơ</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm" pill className="bg-base-200 font-semibold"
                    onClick={() => onViewProfile && onViewProfile(userItem._id)}
                  >
                    Hồ sơ
                  </Button>
                  {userItem.isFriend ? (
                    <span className="btn btn-sm btn-disabled rounded-full font-bold bg-base-200 text-base-content/40">
                      Đã là bạn bè
                    </span>
                  ) : (
                    <button
                      className={`btn btn-sm rounded-full font-bold ${
                        userItem.requested
                          ? 'bg-warning/10 hover:bg-warning/20 text-warning border-warning/30'
                          : 'btn-primary text-white'
                      }`}
                      onClick={() => userItem.requested ? cancelRequest(userItem._id) : sendRequest(userItem._id)}
                    >
                      {userItem.requested ? 'Đã gửi (Bấm để hủy)' : 'Kết bạn'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
