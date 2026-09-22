import api from './client';

export const checkUsername = (username) =>
  api.post('/auth/check-username', { username }).then(res => res.data);

export const sendOtp = (payload) =>
  api.post('/auth/send-otp', payload).then(res => res.data);

export const verifyOtp = (payload) =>
  api.post('/auth/verify-otp', payload).then(res => res.data);

export const setNickname = (nickname) =>
  api.post('/auth/set-nickname', { nickname }).then(res => res.data);

export const login = (username, password, turnstileToken) =>
  api.post('/auth/login', { username, password, turnstileToken }).then(res => res.data);

export const verifyTotpLogin = (challengeToken, code) =>
  api.post('/auth/totp/login', { challengeToken, code }).then(res => res.data);

export const getPasskeyLoginOptions = (challengeToken) =>
  api.post('/auth/passkey/login/options', { challengeToken }).then(res => res.data);
export const verifyPasskeyLogin = (challengeToken, assertionBody) =>
  api.post('/auth/passkey/login/verify', { challengeToken, assertionBody }).then(res => res.data);
export const getMfaStatus = () => api.get('/auth/mfa-status').then(res => res.data);
export const listPasskeys = () => api.get('/auth/passkeys').then(res => res.data);
export const beginPasskeyStepUp = () => api.post('/auth/passkey/step-up/options').then(res => res.data);
export const verifyPasskeyStepUp = (challengeToken, assertionBody) => api.post('/auth/passkey/step-up/verify', { challengeToken, assertionBody }).then(res => res.data);
export const getPasskeyRegisterOptions = (payload) => api.post('/auth/passkey/register/options', payload).then(res => res.data);
export const verifyPasskeyRegistration = (payload) => api.post('/auth/passkey/register/verify', payload).then(res => res.data);
export const renamePasskey = (credentialId, name) => api.patch(`/auth/passkeys/${credentialId}`, { name }).then(res => res.data);
export const removePasskey = (credentialId, payload) => api.delete(`/auth/passkeys/${credentialId}`, { data: payload }).then(res => res.data);
export const saveHistoryBackup = (payload) => api.put('/auth/history-backup', payload).then(res => res.data);
export const getHistoryBackup = () => api.get('/auth/history-backup').then(res => res.data);
export const deleteHistoryBackup = (payload) => api.delete('/auth/history-backup', { data: payload }).then(res => res.data);

export const beginTotpSetup = (payload) =>
  api.post('/auth/totp/setup', payload).then(res => res.data);

export const confirmTotpSetup = (code) =>
  api.post('/auth/totp/confirm', { code }).then(res => res.data);

export const regenerateTotpRecoveryCodes = (payload) =>
  api.post('/auth/totp/recovery-codes', payload).then(res => res.data);

export const disableTotp = (payload) =>
  api.delete('/auth/totp', { data: payload }).then(res => res.data);

export const logout = () =>
  api.post('/auth/logout').then(res => res.data);

export const getMe = () =>
  api.get('/auth/me').then(res => res.data);

export const getCallIceServers = () =>
  api.get('/auth/call-ice-servers').then(res => res.data.iceServers);

export const getLoginHistory = () =>
  api.get('/auth/login-history').then(res => res.data);

export const updateProfile = (form) =>
  api.put('/auth/profile', form).then(res => res.data);

export const requestEmailChange = (payload) =>
  api.post('/auth/request-email-change', payload).then(res => res.data);

export const verifyEmailChange = (payload) =>
  api.post('/auth/verify-email-change', payload).then(res => res.data);

export const changePassword = (payload) =>
  api.put('/auth/change-password', payload).then(res => res.data);

export const uploadAvatar = (formData) =>
  api.post('/auth/avatar', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then(res => res.data);

export const uploadCover = (formData) =>
  api.post('/auth/cover', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then(res => res.data);

export const removeCover = () =>
  api.delete('/auth/cover').then(res => res.data);

export const forgotPassword = (email, turnstileToken) =>
  api.post('/auth/forgot-password', { email, turnstileToken }).then(res => res.data);

export const verifyResetOtp = (email, otp) =>
  api.post('/auth/verify-reset-otp', { email, otp }).then(res => res.data);

export const resetPassword = (payload) =>
  api.post('/auth/reset-password', payload).then(res => res.data);

export const requestAccountDeletion = (payload) =>
  api.post('/auth/request-account-deletion', payload).then(res => res.data);

export const requestAccountRecovery = (email) =>
  api.post('/auth/request-account-recovery', { email }).then(res => res.data);

export const verifyAccountRecovery = (email, otp) =>
  api.post('/auth/verify-account-recovery', { email, otp }).then(res => res.data);

// payload: { deviceId, publicKey, deviceName, currentPassword }
export const registerDevice = (payload) =>
  api.put('/auth/devices', payload).then(res => res.data);

export const getDevices = () =>
  api.get('/auth/devices').then(res => res.data);

export const revokeDevice = (deviceId, currentPassword) =>
  api.delete(`/auth/devices/${deviceId}`, { data: { currentPassword } }).then(res => res.data);

export const createDeviceLinkTransfer = (publicKey) =>
  api.post('/auth/device-link', { publicKey }).then(res => res.data);
export const approveDeviceLinkByCode = (code) =>
  api.post('/auth/device-link/code', { code }).then(res => res.data);
export const approveDeviceLinkTransfer = (sessionId) =>
  api.post(`/auth/device-link/${sessionId}/approve`).then(res => res.data);
export const reserveDeviceLinkArchive = (sessionId, payload) =>
  api.post(`/auth/device-link/${sessionId}/archive`, payload).then(res => res.data);
export const getDeviceLinkArchivePartUploadUrl = (sessionId, partNumber, payload) =>
  api.post(`/auth/device-link/${sessionId}/archive/parts/${partNumber}`, payload).then(res => res.data);
export const completeDeviceLinkArchive = (sessionId) =>
  api.post(`/auth/device-link/${sessionId}/archive/complete`).then(res => res.data);
export const getDeviceLinkArchive = (sessionId) =>
  api.get(`/auth/device-link/${sessionId}/archive`).then(res => res.data);
export const acknowledgeDeviceLinkArchive = (sessionId) =>
  api.delete(`/auth/device-link/${sessionId}/archive`).then(res => res.data);
