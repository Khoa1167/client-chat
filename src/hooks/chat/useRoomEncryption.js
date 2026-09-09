import { useMemo } from 'react';
import {
  encryptMessageForRoom, getDeviceId,
  generateSenderKey, wrapSenderKeyForDevices,
  encryptWithSenderKey, storeSenderKey, getSenderKey,
  createSessionKeyEnvelope, encryptTextWithKey, encryptFileWithKey,
} from '../../crypto';
import { distributeSenderKey, uploadEncryptedFile } from '../../api/rooms.api';
import { getUsersDevicesBatch } from '../../api/users.api';

export const FILE_UPLOAD_CONFIG = {
  image: { uploadPath: '/rooms/upload-image', fieldName: 'image' },
  audio: { uploadPath: '/rooms/upload-audio', fieldName: 'audio' },
  file:  { uploadPath: '/rooms/upload-file',  fieldName: 'file' },
};

// Logic mã hóa E2EE 1 phòng (DM: RSA-per-device, nhóm: Sender Key), tách khỏi ChatWindow — nhận
// roomToUse làm tham số thay vì closure qua props/state. useMemo(...,[]) giữ identity hàm ổn định
// để effect trong useRoomManagement (dùng các hàm này làm dep) không chạy lại mỗi lần render.
function createRoomEncryption() {
  const fetchRoomDevicePublicKeys = async (roomToUse) => {
    if (!roomToUse?.members?.length) return [];

    try {
      const userIds = roomToUse.members.map(m => m._id);
      const devices = await getUsersDevicesBatch(userIds);
      return Array.isArray(devices) ? devices : [];
    } catch (err) {
      console.warn('Lỗi khi lấy public key thiết bị của phòng:', err);
      return [];
    }
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

  // Mã hóa nội dung cho 1 phòng — DM giữ nguyên RSA-per-device, phòng nhóm dùng Sender Key
  const encryptForRoom = async (roomToUse, text, epochOverride) => {
    if (roomToUse.isDM) {
      const allDevicePublicKeys = await fetchRoomDevicePublicKeys(roomToUse);
      const enc = await encryptMessageForRoom(text, allDevicePublicKeys);
      return { content: enc.content, iv: enc.iv, tag: enc.tag, encryptedKeys: enc.encryptedKeys };
    }

    const { senderKey, epoch } = await getOrCreateOutboundSenderKey(roomToUse, epochOverride);
    const enc = await encryptWithSenderKey(text, senderKey);
    return { content: enc.content, iv: enc.iv, tag: enc.tag, encryptedKeys: {}, scheme: 'sender-key', senderDeviceId: getDeviceId(), epoch };
  };

  // Mã hóa file đính kèm bằng ĐÚNG key encryptForRoom dùng (không RSA-wrap key riêng). Ciphertext
  // lên Cloudinary dạng 'raw'; content tin nhắn đổi từ URL trần thành JSON {url, iv}.
  const encryptFileForRoom = async (roomToUse, arrayBuffer, uploadPath, fieldName, epochOverride) => {
    let aesKey;
    let encryptedKeys = {};
    let scheme, senderDeviceId, epoch;

    if (roomToUse.isDM) {
      const allDevicePublicKeys = await fetchRoomDevicePublicKeys(roomToUse);
      const envelope = await createSessionKeyEnvelope(allDevicePublicKeys);
      aesKey = envelope.sessionKey;
      encryptedKeys = envelope.encryptedKeys;
    } else {
      const out = await getOrCreateOutboundSenderKey(roomToUse, epochOverride);
      aesKey = out.senderKey;
      scheme = 'sender-key';
      senderDeviceId = getDeviceId();
      epoch = out.epoch;
    }

    const { ciphertext, iv: fileIv } = await encryptFileWithKey(arrayBuffer, aesKey);

    const formData = new FormData();
    formData.append(fieldName, new Blob([ciphertext]), 'encrypted.bin');
    const data = await uploadEncryptedFile(uploadPath, formData);

    const enc = await encryptTextWithKey(JSON.stringify({ url: data.url, iv: fileIv }), aesKey);

    return { content: enc.content, iv: enc.iv, tag: enc.tag, encryptedKeys, scheme, senderDeviceId, epoch };
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

export default function useRoomEncryption() {
  return useMemo(() => createRoomEncryption(), []);
}
