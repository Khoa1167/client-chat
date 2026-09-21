import { useMemo } from 'react';
import {
  getDeviceId,
  generateSenderKey, wrapSenderKeyForDevices,
  encryptWithSenderKey, storeSenderKey, getSenderKey,
  encryptTextWithKey, encryptFileWithKey,
} from '../../crypto';
import { distributeSenderKey, getRoomDevices, uploadEncryptedAttachment } from '../../api/rooms.api';
import { saveAttachmentCiphertext } from '../../storage/attachmentStore';

export const FILE_UPLOAD_CONFIG = {
  image: { maxCiphertextSize: 10 * 1024 * 1024 },
  audio: { maxCiphertextSize: 10 * 1024 * 1024 },
  file:  { maxCiphertextSize: 25 * 1024 * 1024 },
};

function inferMimeType(fileName, mimeType) {
  if (mimeType) return mimeType;
  const extension = fileName.split('.').pop()?.toLowerCase();
  return ({ txt: 'text/plain', csv: 'text/csv', json: 'application/json', md: 'text/markdown', xml: 'application/xml', yaml: 'text/yaml', yml: 'text/yaml' })[extension] || '';
}

// Logic mã hóa E2EE 1 phòng bằng Sender Key theo thiết bị gửi/epoch, tách khỏi ChatWindow — nhận
// roomToUse làm tham số thay vì closure qua props/state. useMemo(...,[]) giữ identity hàm ổn định
// để effect trong useRoomManagement (dùng các hàm này làm dep) không chạy lại mỗi lần render.
function createRoomEncryption(userId) {
  const fetchRoomDevicePublicKeys = async (roomToUse) => {
    if (!roomToUse?._id) throw new Error('Phòng không hợp lệ');
    const devices = await getRoomDevices(roomToUse._id);
    return Array.isArray(devices) ? devices : [];
  };

  // Lấy/tạo Sender Key cho (phòng, thiết bị, epoch) — tạo mới thì RSA-wrap phân phối cho cả phòng rồi cache lại.
  const getOrCreateOutboundSenderKey = async (roomToUse, epochOverride) => {
    const devId = getDeviceId();
    const epoch = epochOverride ?? (roomToUse.senderKeyEpoch || 0);

    const cached = await getSenderKey(roomToUse._id, devId, epoch);
    if (cached) return { senderKey: cached, epoch };

    const senderKey = await generateSenderKey();
    const allDevicePublicKeys = await fetchRoomDevicePublicKeys(roomToUse);
    const encryptedKeys = await wrapSenderKeyForDevices(senderKey, allDevicePublicKeys);
    await distributeSenderKey(roomToUse._id, { epoch, senderDeviceId: devId, encryptedKeys });
    await storeSenderKey(roomToUse._id, devId, epoch, senderKey);
    return { senderKey, epoch };
  };

  // Mã hóa nội dung cho mọi phòng bằng Sender Key đã phân phối theo epoch.
  const encryptForRoom = async (roomToUse, text, epochOverride) => {
    const { senderKey, epoch } = await getOrCreateOutboundSenderKey(roomToUse, epochOverride);
    const enc = await encryptWithSenderKey(text, senderKey);
    return { content: enc.content, iv: enc.iv, tag: enc.tag, encryptedKeys: {}, scheme: 'sender-key', senderDeviceId: getDeviceId(), epoch };
  };

  // Nén có điều kiện → padding → AES-GCM trước khi upload trực tiếp R2. Pointer attachment
  // (id, IV, tên/MIME) tiếp tục được mã hóa trong message nên backend không đọc được metadata đó.
  const encryptFileForRoom = async (roomToUse, arrayBuffer, type, { fileName = '', mimeType = '' } = {}, epochOverride) => {
    const out = await getOrCreateOutboundSenderKey(roomToUse, epochOverride);
    const aesKey = out.senderKey;

    const config = FILE_UPLOAD_CONFIG[type];
    if (!config) throw new Error('Loại attachment không hợp lệ');
    const resolvedMimeType = inferMimeType(fileName, mimeType);
    const { ciphertext, iv: fileIv } = await encryptFileWithKey(arrayBuffer, aesKey, {
      mimeType: resolvedMimeType,
      maxCiphertextSize: config.maxCiphertextSize,
    });
    const attachmentId = await uploadEncryptedAttachment(roomToUse._id, type, ciphertext);
    if (userId) await saveAttachmentCiphertext(userId, roomToUse._id, attachmentId, ciphertext).catch(() => {});
    const enc = await encryptTextWithKey(JSON.stringify({ attachmentId, iv: fileIv, name: fileName, mimeType: resolvedMimeType }), aesKey);

    return { content: enc.content, iv: enc.iv, tag: enc.tag, encryptedKeys: {}, scheme: 'sender-key', senderDeviceId: getDeviceId(), epoch: out.epoch, attachmentId };
  };

  // Phân phối lại Sender Key (cùng epoch) cho thiết bị/thành viên mới, nếu mình đang giữ outbound key.
  const redistributeSenderKey = async (roomId, epoch, devicePublicKeys) => {
    const devId = getDeviceId();
    const cached = await getSenderKey(roomId, devId, epoch);
    if (!cached) return;
    try {
      const encryptedKeys = await wrapSenderKeyForDevices(cached, devicePublicKeys);
      await distributeSenderKey(roomId, { epoch, senderDeviceId: devId, encryptedKeys });
    } catch (err) {
      console.error('[E2EE] Sender Key redistribution error:', err);
    }
  };

  return {
    fetchRoomDevicePublicKeys,
    getOrCreateOutboundSenderKey,
    encryptForRoom,
    encryptFileForRoom,
    redistributeSenderKey,
    FILE_UPLOAD_CONFIG,
  };
}

export default function useRoomEncryption(userId) {
  return useMemo(() => createRoomEncryption(userId), [userId]);
}
