import api from './client';

// Gửi audio ĐÃ GIẢI MÃ (client tự decrypt trước, xem MessageItem.jsx EncryptedAudio) lên server
// proxy Whisper — opt-in mỗi tin nhắn, xem CLAUDE.md mục "Khi tích hợp AI".
export const transcribeAudio = (blob, signal) => {
  const formData = new FormData();
  formData.append('audio', blob, 'audio.webm');
  return api.post('/transcribe', formData, { headers: { 'Content-Type': 'multipart/form-data' }, signal, timeout: 35000 }).then(res => res.data);
};
