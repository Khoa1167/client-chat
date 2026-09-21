import api from './client';

export const getMyRooms = () =>
  api.get('/rooms').then(res => res.data);

export const createRoom = (payload) =>
  api.post('/rooms', payload).then(res => res.data);

// params: { before, limit } — before/limit truyền thẳng qua axios params, không cần tự encode
export const getRoomMessages = (roomId, params) =>
  api.get(`/rooms/${roomId}/messages`, { params }).then(res => res.data);

export const getRoomDevices = (roomId) =>
  api.get(`/rooms/${roomId}/devices`).then(res => res.data);

export const previewInvite = (inviteCode) =>
  api.get(`/rooms/invite/${inviteCode}`).then(res => res.data);

export const joinViaInvite = (inviteCode) =>
  api.post(`/rooms/invite/${inviteCode}`).then(res => res.data);

export const getInviteCode = (roomId) =>
  api.get(`/rooms/${roomId}/invite-code`).then(res => res.data);

export const rotateInviteCode = (roomId) =>
  api.put(`/rooms/${roomId}/rotate-invite`).then(res => res.data);

export const updateRoomSettings = (roomId, payload) =>
  api.put(`/rooms/${roomId}/settings`, payload).then(res => res.data);

export const updateRoomAvatar = (roomId, formData) =>
  api.post(`/rooms/${roomId}/avatar`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then(res => res.data);

export const updateChatBackground = (roomId, chatBackground) =>
  api.put(`/rooms/${roomId}/chat-background`, { chatBackground }).then(res => res.data);

export const uploadChatBackgroundImage = (roomId, formData) =>
  api.post(`/rooms/${roomId}/chat-background/image`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then(res => res.data);

export const updateChatMessageColor = (roomId, chatMessageColor) =>
  api.put(`/rooms/${roomId}/chat-message-color`, { chatMessageColor }).then(res => res.data);

export const getJoinRequests = (roomId) =>
  api.get(`/rooms/${roomId}/join-requests`).then(res => res.data);

export const approveJoinRequest = (roomId, userId) =>
  api.put(`/rooms/${roomId}/join-requests/${userId}`).then(res => res.data);

export const rejectJoinRequest = (roomId, userId) =>
  api.delete(`/rooms/${roomId}/join-requests/${userId}`).then(res => res.data);

export const inviteFriendToRoom = (roomId, userId) =>
  api.post(`/rooms/${roomId}/invites/${userId}`).then(res => res.data);

export const getMyPendingInvites = () =>
  api.get('/rooms/invites/mine').then(res => res.data);

export const acceptRoomInvite = (roomId) =>
  api.put(`/rooms/${roomId}/invites/accept`).then(res => res.data);

export const declineRoomInvite = (roomId) =>
  api.delete(`/rooms/${roomId}/invites/decline`).then(res => res.data);

// payload: { epoch, senderDeviceId, encryptedKeys }
export const distributeSenderKey = (roomId, payload) =>
  api.post(`/rooms/${roomId}/sender-key`, payload).then(res => res.data);

// params: { epoch, senderDeviceId }
export const getSenderKeyDoc = (roomId, params) =>
  api.get(`/rooms/${roomId}/sender-key`, { params }).then(res => res.data);

export const rotateSenderKey = (roomId) =>
  api.put(`/rooms/${roomId}/rotate-key`).then(res => res.data);

export const leaveRoom = (roomId, newOwnerId) =>
  api.post(`/rooms/${roomId}/leave`, newOwnerId ? { newOwnerId } : {}).then(res => res.data);

export const deleteRoom = (roomId) =>
  api.delete(`/rooms/${roomId}`).then(res => res.data);

export const kickMember = (roomId, userId) =>
  api.delete(`/rooms/${roomId}/members/${userId}`).then(res => res.data);

export const promoteAdmin = (roomId, userId) =>
  api.put(`/rooms/${roomId}/admins/${userId}`).then(res => res.data);

export const demoteAdmin = (roomId, userId) =>
  api.delete(`/rooms/${roomId}/admins/${userId}`).then(res => res.data);

export const transferOwnership = (roomId, userId) =>
  api.put(`/rooms/${roomId}/owner/${userId}`).then(res => res.data);

export const grantPermission = (roomId, userId, permission) =>
  api.put(`/rooms/${roomId}/permissions/${userId}`, { permission }).then(res => res.data);

export const revokePermission = (roomId, userId, permission) =>
  api.delete(`/rooms/${roomId}/permissions/${userId}`, { data: { permission } }).then(res => res.data);

export const uploadEncryptedAttachment = async (roomId, type, ciphertext) => {
  const reservation = await api.post(`/rooms/${roomId}/attachments`, {
    type,
    expectedSize: ciphertext.byteLength,
  }).then(res => res.data);

  const response = await fetch(reservation.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: ciphertext,
  });
  if (!response.ok) throw new Error('Không thể upload attachment lên R2');

  await api.post(`/rooms/${roomId}/attachments/${reservation.attachmentId}/complete`);
  return reservation.attachmentId;
};

export const getAttachmentDownloadUrl = (roomId, attachmentId) =>
  api.get(`/rooms/${roomId}/attachments/${attachmentId}/download-url`).then(res => res.data.url);
