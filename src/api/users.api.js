import api from './client';

// publicKey/deviceId của người KHÁC (dùng E2EE) — khác auth.api.js (thiết bị của chính mình)
export const getUserDevices = (userId) =>
  api.get(`/users/${userId}/devices`).then(res => res.data);
