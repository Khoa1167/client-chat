import api from './client';

export const getFriends = () =>
  api.get('/friends').then(res => res.data);

export const getFriendRequests = () =>
  api.get('/friends/requests').then(res => res.data);

export const searchUsers = (q) =>
  api.get('/friends/search', { params: { q } }).then(res => res.data);

export const sendFriendRequest = (userId) =>
  api.post(`/friends/request/${userId}`).then(res => res.data);

export const cancelFriendRequest = (userId) =>
  api.delete(`/friends/cancel/${userId}`).then(res => res.data);

export const acceptFriendRequest = (friendshipId) =>
  api.put(`/friends/accept/${friendshipId}`).then(res => res.data);

export const rejectFriendRequest = (friendshipId) =>
  api.put(`/friends/reject/${friendshipId}`).then(res => res.data);

export const unfriend = (userId) =>
  api.delete(`/friends/unfriend/${userId}`).then(res => res.data);

export const getDmRoom = (userId) =>
  api.get(`/friends/dm/${userId}`).then(res => res.data);

export const getUserProfile = (userId) =>
  api.get(`/friends/profile/${userId}`).then(res => res.data);

export const setFriendAlias = (userId, alias) =>
  api.put(`/friends/alias/${userId}`, { alias }).then(res => res.data);

export const getBlockedUsers = (page = 1) =>
  api.get('/friends/blocked', { params: { page } }).then(res => res.data);

export const blockUser = (userId) =>
  api.post(`/friends/block/${userId}`).then(res => res.data);

export const unblockUser = (userId) =>
  api.delete(`/friends/block/${userId}`).then(res => res.data);
