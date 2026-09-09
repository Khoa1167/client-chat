import api from './client';

// payload: { messageId, decryptedContent, ciphertextHash, reason }
export const submitReport = (payload) =>
  api.post('/reports', payload).then(res => res.data);

export const getReports = () =>
  api.get('/reports').then(res => res.data);

export const resolveReport = (reportId, status) =>
  api.post(`/reports/${reportId}/resolve`, { status }).then(res => res.data);
