import { Directory, Filesystem } from '@capacitor/filesystem';
import { arrayBufferToBase64, base64ToArrayBuffer } from '../crypto/base64';
import { isAttachmentCacheExpired, MAX_ATTACHMENT_CACHE_BYTES } from './attachmentCachePolicy';

const part = value => encodeURIComponent(String(value));
const filePath = (userId, roomId, attachmentId) => `attachments/${part(userId)}/${part(roomId)}/${part(attachmentId)}.bin`;
const INDEX_PATH = 'attachments/.cache-index.json';

let operation = Promise.resolve();

const enqueue = (task) => {
  const result = operation.then(task, task);
  operation = result.catch(() => {});
  return result;
};

async function readIndex() {
  try {
    const { data } = await Filesystem.readFile({ path: INDEX_PATH, directory: Directory.Cache });
    const parsed = JSON.parse(typeof data === 'string' ? data : await data.text());
    return parsed?.entries && typeof parsed.entries === 'object' ? parsed : { entries: {} };
  } catch {
    return rebuildIndex();
  }
}

const writeIndex = index => Filesystem.writeFile({
  path: INDEX_PATH,
  data: JSON.stringify(index),
  directory: Directory.Cache,
  recursive: true,
});

async function rebuildIndex(path = 'attachments', entries = {}) {
  try {
    const { files } = await Filesystem.readdir({ path, directory: Directory.Cache });
    for (const file of files) {
      const childPath = `${path}/${file.name}`;
      if (file.type === 'directory') await rebuildIndex(childPath, entries);
      else if (file.name.endsWith('.bin')) entries[childPath] = {
        path: childPath,
        size: file.size,
        lastUsedAt: file.mtime,
      };
    }
  } catch {
    // Android có thể đã tự dọn cache.
  }
  return { entries };
}

async function deleteEntry(index, key) {
  const entry = index.entries[key];
  if (!entry) return;
  delete index.entries[key];
  await Filesystem.deleteFile({ path: entry.path, directory: Directory.Cache }).catch(() => {});
}

async function pruneIndex(index, incomingSize, now) {
  const entries = Object.entries(index.entries);
  for (const [key, entry] of entries) {
    if (isAttachmentCacheExpired(entry.lastUsedAt, now)) await deleteEntry(index, key);
  }

  const retained = Object.entries(index.entries).map(([key, entry]) => ({ key, ...entry }));
  let total = retained.reduce((sum, entry) => sum + entry.size, 0);
  for (const entry of retained.sort((a, b) => a.lastUsedAt - b.lastUsedAt)) {
    if (total + incomingSize <= MAX_ATTACHMENT_CACHE_BYTES) break;
    await deleteEntry(index, entry.key);
    total -= entry.size;
  }
}

export async function getAttachmentCiphertext(userId, roomId, attachmentId) {
  return enqueue(async () => {
    const path = filePath(userId, roomId, attachmentId);
    const index = await readIndex();
    const now = Date.now();
    await pruneIndex(index, 0, now);
    const entry = index.entries[path];
    if (entry && isAttachmentCacheExpired(entry.lastUsedAt, now)) {
      await deleteEntry(index, path);
      await writeIndex(index);
      return null;
    }
    try {
      const { data } = await Filesystem.readFile({ path, directory: Directory.Cache });
      const ciphertext = typeof data === 'string' ? base64ToArrayBuffer(data) : await data.arrayBuffer();
      index.entries[path] = { path, userId: String(userId), size: ciphertext.byteLength, lastUsedAt: now };
      await writeIndex(index).catch(() => {});
      return ciphertext;
    } catch {
      if (entry) {
        delete index.entries[path];
        await writeIndex(index);
      }
      return null;
    }
  });
}

export async function saveAttachmentCiphertext(userId, roomId, attachmentId, ciphertext) {
  return enqueue(async () => {
    const path = filePath(userId, roomId, attachmentId);
    const index = await readIndex();
    const previousSize = index.entries[path]?.size || 0;
    await pruneIndex(index, ciphertext.byteLength - previousSize, Date.now());
    await Filesystem.writeFile({ path: 'attachments/.nomedia', data: '', directory: Directory.Cache, recursive: true });
    await Filesystem.writeFile({
      path,
      data: arrayBufferToBase64(ciphertext),
      directory: Directory.Cache,
      recursive: true,
    });
    index.entries[path] = { path, userId: String(userId), size: ciphertext.byteLength, lastUsedAt: Date.now() };
    await writeIndex(index);
  });
}

export async function clearUserAttachments(userId) {
  return enqueue(async () => {
    try {
      await Filesystem.rmdir({ path: `attachments/${part(userId)}`, directory: Directory.Cache, recursive: true });
    } catch {
      // Android có thể đã tự dọn cache.
    }
    const index = await readIndex();
    const userPath = `attachments/${part(userId)}/`;
    for (const [key, entry] of Object.entries(index.entries)) {
      if (entry.userId === String(userId) || entry.path.startsWith(userPath)) delete index.entries[key];
    }
    await writeIndex(index).catch(() => {});
  });
}
