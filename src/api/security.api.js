import api from './client';

export const checkLink = (url) =>
  api.post('/security/check-link', { url }).then(res => res.data);
