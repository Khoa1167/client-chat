/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect } from 'react';
import { registerDevice, getMe, login as loginApi, verifyTotpLogin as verifyTotpLoginApi, verifyPasskeyLogin as verifyPasskeyLoginApi, logout as logoutApi } from '../api/auth.api';
import { setCryptoUserId, clearUserCryptoData, getDeviceId, getE2eeKeyId, getPrivateKey, getPublicKey, generateKeyPair, storePrivateKey, storePublicKey, exportPublicKey, exportPublicKeyFromPrivateKey } from '../crypto';
import { clearUserAttachments } from '../storage/attachmentStore';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser]       = useState(null);
  // Token nằm trong cookie httpOnly, JS không đọc được nữa — không còn cách nào biết trước
  // "có khả năng đã đăng nhập" như cũ (check sessionStorage), phải luôn thử gọi /me.
  const [loading, setLoading] = useState(true);
  const [needDevicePassword, setNeedDevicePassword] = useState(false);

  // Helper đảm bảo thiết bị hiện tại được tạo và đăng ký E2EE Key
  const initDeviceKey = async (currentPassword) => {
    const deviceId = getDeviceId();
    const e2eeKeyId = getE2eeKeyId();
    let privateKey = await getPrivateKey(e2eeKeyId);
    let publicKeyJWK;

    if (!privateKey) {
      const keyPair = await generateKeyPair();
      privateKey = keyPair.privateKey;
      await storePrivateKey(e2eeKeyId, privateKey);
      publicKeyJWK = await exportPublicKey(keyPair.publicKey);
      await storePublicKey(e2eeKeyId, publicKeyJWK);
    } else {
      const storedPublicKey = await getPublicKey(e2eeKeyId);
      if (storedPublicKey) {
        publicKeyJWK = storedPublicKey;
      } else {
        try {
          publicKeyJWK = await exportPublicKeyFromPrivateKey(privateKey);
          await storePublicKey(e2eeKeyId, publicKeyJWK);
        } catch (err) {
          console.warn('[E2EE] Cannot recover public key from private key:', err);
      throw new Error('Public key thiết bị bị thiếu. Vui lòng đăng ký lại thiết bị.', { cause: err });
        }
      }
    }

    const deviceName = `${navigator.platform} (${navigator.userAgent.includes('Chrome') ? 'Chrome' : 'Browser'})`;

    // Gọi API đăng ký/gia hạn thiết bị với mật khẩu xác nhận
    const data = await registerDevice({
      deviceId,
      e2eeKeyId,
      publicKey: publicKeyJWK,
      deviceName,
      currentPassword,
    });

    return data;
  };

  useEffect(() => {
    getMe()
      .then(data => {
        if (data?._id) setCryptoUserId(data._id);
        setUser(data?._id ? data : null);
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const finishLogin = async (data, password) => {
    // Đăng ký thiết bị TRƯỚC khi setUser — token lúc này vẫn là Bootstrap Token (chỉ vài route
    // whitelist dùng được, xem authWhitelist.js), setUser sớm sẽ khiến ChatPage/Sidebar mount và
    // gọi API (getMyRooms...) trước khi cookie đổi thành Device Token thật, gây lỗi 403.
    setCryptoUserId(data.user._id);
    try {
      await initDeviceKey(password);
    } catch (err) {
      // Chỉ log message — err (axios error) giữ nguyên err.config.data là request body vừa gửi,
      // gồm cả currentPassword plaintext; log cả object sẽ lộ mật khẩu ra console.
      console.warn('[E2EE] Initial device registration warning:', err.message);
      await logoutApi().catch(() => {});
      await clearUserCryptoData().catch(() => {});
      await clearUserAttachments(data.user._id).catch(() => {});
      setCryptoUserId(null);
      throw err;
    }

    const updatedUser = await getMe().catch(() => data.user);
    setUser(updatedUser);
    return { ...data, user: updatedUser };
  };

  const login = async (username, password, turnstileToken) => {
    const data = await loginApi(username, password, turnstileToken);
    if (data.mfaRequired) return data;
    return finishLogin(data, password);
  };

  const verifyTotpLogin = async (challengeToken, code, password) => {
    const data = await verifyTotpLoginApi(challengeToken, code);
    return finishLogin(data, password);
  };
  const verifyPasskeyLogin = async (challengeToken, assertionBody, password) => finishLogin(await verifyPasskeyLoginApi(challengeToken, assertionBody), password);

  const logout = async () => {
    // Thu hồi token phía server (xóa tokenHash thiết bị + cookie) — nếu không, token cũ (kể cả
    // bản sao bị đánh cắp) vẫn còn hiệu lực trên server tới hạn tự nhiên.
    try {
      await logoutApi();
    } catch (err) {
      console.warn('[Auth] Logout revoke error (vẫn đăng xuất local):', err.message);
    }
    await clearUserCryptoData().catch(() => {});
    if (user?._id) await clearUserAttachments(user._id).catch(() => {});
    setCryptoUserId(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, verifyTotpLogin, verifyPasskeyLogin, logout, initDeviceKey, needDevicePassword, setNeedDevicePassword }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
