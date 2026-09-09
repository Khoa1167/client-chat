import api from './client';

export const getNotifications = () =>
  api.get('/notifications').then(res => res.data);

export const markNotificationsRead = () =>
  api.put('/notifications/read').then(res => res.data);
