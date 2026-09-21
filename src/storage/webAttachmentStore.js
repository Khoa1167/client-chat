import { isAttachmentCacheExpired, MAX_ATTACHMENT_CACHE_BYTES } from './attachmentCachePolicy';

const CACHE_NAME = 'chat-attachments-v1';
const CACHE_PREFIX = '/__attachment-cache__/';
const CACHE_TIME_HEADER = 'X-Attachment-Cache-Time';
const CACHE_SIZE_HEADER = 'X-Attachment-Cache-Size';

let operation = Promise.resolve();

const enqueue = (task) => {
  const result = operation.then(task, task);
  operation = result.catch(() => {});
  return result;
};

const cacheKey = (userId, roomId, attachmentId) => (
  `${location.origin}${CACHE_PREFIX}${encodeURIComponent(userId)}/${encodeURIComponent(roomId)}/${encodeURIComponent(attachmentId)}.bin`
);

const cacheResponse = (ciphertext, now) => new Response(ciphertext, {
  headers: {
    'Content-Type': 'application/octet-stream',
    [CACHE_TIME_HEADER]: String(now),
    [CACHE_SIZE_HEADER]: String(ciphertext.byteLength),
  },
});

async function pruneCache(cache, incomingSize, now) {
  const entries = [];
  for (const request of await cache.keys()) {
    if (!request.url.includes(CACHE_PREFIX)) continue;
    const response = await cache.match(request);
    const lastUsedAt = Number(response?.headers.get(CACHE_TIME_HEADER));
    const size = Number(response?.headers.get(CACHE_SIZE_HEADER));
    if (!response || isAttachmentCacheExpired(lastUsedAt, now) || !Number.isFinite(size)) {
      await cache.delete(request);
      continue;
    }
    entries.push({ request, lastUsedAt, size });
  }

  let total = entries.reduce((sum, entry) => sum + entry.size, 0);
  for (const entry of entries.sort((a, b) => a.lastUsedAt - b.lastUsedAt)) {
    if (total + incomingSize <= MAX_ATTACHMENT_CACHE_BYTES) break;
    await cache.delete(entry.request);
    total -= entry.size;
  }
}

export async function getAttachmentCiphertext(userId, roomId, attachmentId) {
  if (!('caches' in window)) return null;
  return enqueue(async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      const key = cacheKey(userId, roomId, attachmentId);
      const response = await cache.match(key);
      const now = Date.now();
      if (!response) return null;
      if (isAttachmentCacheExpired(Number(response.headers.get(CACHE_TIME_HEADER)), now)) {
        await cache.delete(key);
        return null;
      }
      const ciphertext = await response.arrayBuffer();
      await cache.put(key, cacheResponse(ciphertext, now)).catch(() => {});
      return ciphertext;
    } catch {
      return null;
    }
  });
}

export async function saveAttachmentCiphertext(userId, roomId, attachmentId, ciphertext) {
  if (!('caches' in window)) return;
  return enqueue(async () => {
    const cache = await caches.open(CACHE_NAME);
    await pruneCache(cache, ciphertext.byteLength, Date.now());
    await cache.put(cacheKey(userId, roomId, attachmentId), cacheResponse(ciphertext, Date.now()));
  });
}

export async function clearUserAttachments(userId) {
  if (!('caches' in window)) return;
  return enqueue(async () => {
    const cache = await caches.open(CACHE_NAME);
    const prefix = `${location.origin}${CACHE_PREFIX}${encodeURIComponent(userId)}/`;
    await Promise.all((await cache.keys()).filter(request => request.url.startsWith(prefix)).map(request => cache.delete(request)));
  });
}
