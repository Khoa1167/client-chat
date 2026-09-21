import { arrayBufferToBase64, base64ToArrayBuffer } from './base64.js';
import { exportSenderKeys, importSenderKeys } from './deviceKeys.js';
import { iterateAllCachedMessages, mergeCachedMessages } from './messageCache.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const HEADER_BYTES = 9;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const PART_BYTES = 8 * 1024 * 1024;
const RECORD_TARGET_BYTES = 1024 * 1024;
const MAX_CIPHERTEXT_BYTES = 4 * 1024 * 1024;
const FLAG_FINAL = 1;
const FLAG_COMPRESSED = 2;

const invalidArchive = () => Object.assign(new Error('Không thể xác thực hoặc nhập lịch sử được mã hóa'), { archiveInvalid: true });
const concat = (...chunks) => {
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  chunks.forEach(chunk => { result.set(new Uint8Array(chunk), offset); offset += chunk.byteLength; });
  return result;
};

const gzip = async (bytes) => {
  if (!globalThis.CompressionStream) return { bytes, compressed: false };
  const stream = new Blob([bytes]).stream().pipeThrough(new globalThis.CompressionStream('gzip'));
  return { bytes: new Uint8Array(await new Response(stream).arrayBuffer()), compressed: true };
};

const gunzip = async (bytes, compressed) => {
  if (!compressed) return bytes;
  if (!globalThis.DecompressionStream) throw invalidArchive();
  const stream = new Blob([bytes]).stream().pipeThrough(new globalThis.DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

export const createDeviceLinkKeyPair = () => crypto.subtle.generateKey(
  { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
);

export const exportDeviceLinkPublicKey = (publicKey) => crypto.subtle.exportKey('jwk', publicKey);

const deriveArchiveKey = async (privateKey, peerPublicKey) => {
  const publicKey = await crypto.subtle.importKey('jwk', peerPublicKey, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256);
  return crypto.subtle.importKey('raw', bits, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
};

const headerFor = (flags, recordNumber, ciphertextLength) => {
  const header = new Uint8Array(HEADER_BYTES);
  const view = new DataView(header.buffer);
  header[0] = flags;
  view.setUint32(1, recordNumber, false);
  view.setUint32(5, ciphertextLength, false);
  return header;
};

const aadFor = (sessionId, header) => concat(encoder.encode(`device-link:${sessionId}:`), header);

export const readArchiveFrameHeader = (bytes) => {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < HEADER_BYTES) throw invalidArchive();
  const flags = bytes[0];
  if (flags & ~(FLAG_FINAL | FLAG_COMPRESSED)) throw invalidArchive();
  const view = new DataView(bytes.buffer, bytes.byteOffset, HEADER_BYTES);
  const ciphertextLength = view.getUint32(5, false);
  if (!ciphertextLength || ciphertextLength > MAX_CIPHERTEXT_BYTES) throw invalidArchive();
  return {
    flags,
    recordNumber: view.getUint32(1, false),
    ciphertextLength,
    frameLength: HEADER_BYTES + IV_BYTES + ciphertextLength,
  };
};

export const encodeArchiveFrame = async (key, sessionId, recordNumber, payload, isFinal) => {
  const packed = await gzip(encoder.encode(JSON.stringify(payload)));
  const ciphertextLength = packed.bytes.byteLength + TAG_BYTES;
  if (ciphertextLength > MAX_CIPHERTEXT_BYTES) throw new Error('Một phần lịch sử quá lớn để chuyển');
  const flags = (isFinal ? FLAG_FINAL : 0) | (packed.compressed ? FLAG_COMPRESSED : 0);
  const header = headerFor(flags, recordNumber, ciphertextLength);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aadFor(sessionId, header) }, key, packed.bytes);
  return concat(header, iv, new Uint8Array(ciphertext));
};

export const decodeArchiveFrame = async (key, sessionId, frame, expectedRecordNumber) => {
  const header = readArchiveFrameHeader(frame);
  if (header.recordNumber !== expectedRecordNumber || frame.byteLength !== header.frameLength) throw invalidArchive();
  try {
    const iv = frame.slice(HEADER_BYTES, HEADER_BYTES + IV_BYTES);
    const ciphertext = frame.slice(HEADER_BYTES + IV_BYTES);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: aadFor(sessionId, frame.slice(0, HEADER_BYTES)) }, key, ciphertext,
    );
    return { ...header, payload: JSON.parse(decoder.decode(await gunzip(new Uint8Array(plaintext), Boolean(header.flags & FLAG_COMPRESSED)))) };
  } catch {
    throw invalidArchive();
  }
};

const roomIdOf = (message) => (message?.room?._id || message?.room)?.toString();

const importMessages = async (userId, messages) => {
  const byRoom = new Map();
  for (const message of messages) {
    const roomId = roomIdOf(message);
    if (!message?._id || !roomId) continue;
    const roomMessages = byRoom.get(roomId) || [];
    roomMessages.push({ ...message, room: roomId });
    byRoom.set(roomId, roomMessages);
  }
  for (const [roomId, roomMessages] of byRoom) {
    for (let offset = 0; offset < roomMessages.length; offset += 100) {
      await mergeCachedMessages(userId, roomId, roomMessages.slice(offset, offset + 100));
    }
  }
};

async function* archivePayloads(userId, senderKeys) {
  yield { type: 'manifest', senderKeys: senderKeys.map(({ keyId, raw }) => ({ keyId, raw: arrayBufferToBase64(raw) })) };
  let messages = [];
  let size = 32;
  for await (const batch of iterateAllCachedMessages(userId)) {
    for (const message of batch) {
      const messageSize = encoder.encode(JSON.stringify(message)).byteLength + 1;
      if (messages.length && size + messageSize > RECORD_TARGET_BYTES) {
        yield { type: 'messages', messages };
        messages = [];
        size = 32;
      }
      messages.push(message);
      size += messageSize;
    }
  }
  if (messages.length) yield { type: 'messages', messages };
}

async function* encryptedFrames(key, sessionId, payloads) {
  let pending = null;
  let recordNumber = 0;
  for await (const payload of payloads) {
    if (pending) yield encodeArchiveFrame(key, sessionId, recordNumber++, pending, false);
    pending = payload;
  }
  if (!pending) throw new Error('Archive không hợp lệ');
  yield encodeArchiveFrame(key, sessionId, recordNumber, pending, true);
}

async function* multipartParts(frames) {
  let buffered = new Uint8Array();
  for await (const framePromise of frames) {
    buffered = concat(buffered, await framePromise);
    while (buffered.byteLength > PART_BYTES) {
      yield { bytes: buffered.slice(0, PART_BYTES), isFinal: false };
      buffered = buffered.slice(PART_BYTES);
    }
  }
  if (buffered.byteLength) yield { bytes: buffered, isFinal: true };
}

export const createEncryptedDeviceArchive = async (userId, targetPublicKey, sessionId) => {
  const [senderKeys, sourceKeyPair] = await Promise.all([exportSenderKeys(), createDeviceLinkKeyPair()]);
  const key = await deriveArchiveKey(sourceKeyPair.privateKey, targetPublicKey);
  return {
    sourcePublicKey: await exportDeviceLinkPublicKey(sourceKeyPair.publicKey),
    parts: multipartParts(encryptedFrames(key, sessionId, archivePayloads(userId, senderKeys))),
  };
};

const totalFromResponse = (response, offset) => {
  const range = response.headers.get('Content-Range');
  const match = range && /\/(\d+)$/.exec(range);
  if (match) return Number(match[1]);
  const length = Number(response.headers.get('Content-Length'));
  return Number.isFinite(length) ? offset + length : null;
};

export const importEncryptedDeviceArchive = async (userId, privateKey, archive, sessionId, fetchFrom, onProgress) => {
  if (!archive?.sourcePublicKey) throw invalidArchive();
  const key = await deriveArchiveKey(privateKey, archive.sourcePublicKey);
  let checkpoint = 0;
  let expectedRecordNumber = 0;
  let sawManifest = false;
  let sawFinal = false;
  let imported = 0;
  let retries = 0;

  while (!sawFinal) {
    try {
      const response = await fetchFrom(checkpoint);
      if (!response?.ok || !response.body) throw new Error('download failed');
      if (checkpoint && response.status !== 206) throw invalidArchive();
      const total = totalFromResponse(response, checkpoint);
      const reader = response.body.getReader();
      let buffer = new Uint8Array();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (sawFinal) throw invalidArchive();
        buffer = concat(buffer, value);
        while (buffer.byteLength >= HEADER_BYTES) {
          const header = readArchiveFrameHeader(buffer);
          if (buffer.byteLength < header.frameLength) break;
          const frame = buffer.slice(0, header.frameLength);
          const decoded = await decodeArchiveFrame(key, sessionId, frame, expectedRecordNumber++);
          if (!sawManifest) {
            if (decoded.payload?.type !== 'manifest' || !Array.isArray(decoded.payload.senderKeys)) throw invalidArchive();
            await importSenderKeys(decoded.payload.senderKeys.map(entry => ({ ...entry, raw: base64ToArrayBuffer(entry.raw) })));
            sawManifest = true;
          } else {
            if (decoded.payload?.type !== 'messages' || !Array.isArray(decoded.payload.messages)) throw invalidArchive();
            await importMessages(userId, decoded.payload.messages);
            imported += decoded.payload.messages.length;
          }
          buffer = buffer.slice(header.frameLength);
          checkpoint += header.frameLength;
          onProgress?.({ bytes: checkpoint, total });
          if (decoded.flags & FLAG_FINAL) {
            if (buffer.byteLength || (total !== null && checkpoint !== total)) throw invalidArchive();
            sawFinal = true;
          }
        }
      }
      if (sawFinal) break;
      if (buffer.byteLength) throw new Error('download interrupted');
      throw invalidArchive();
    } catch (error) {
      if (error?.archiveInvalid || retries >= 2) throw error?.archiveInvalid ? error : invalidArchive();
      retries += 1;
    }
  }
  if (!sawManifest) throw invalidArchive();
  return imported;
};
