import api from './client';

// params: { q, page }
export const listUsers = (params) =>
  api.get('/admin/users', { params }).then(res => res.data);

export const banUser = (userId) =>
  api.post(`/admin/users/${userId}/ban`).then(res => res.data);

export const unbanUser = (userId) =>
  api.post(`/admin/users/${userId}/unban`).then(res => res.data);
