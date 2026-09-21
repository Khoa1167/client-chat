import { Capacitor } from '@capacitor/core';

let enginePromise;

const getEngine = () => {
  enginePromise ??= Capacitor.isNativePlatform()
    ? import('./sqliteStore.js')
    : import('./indexedDBStore.js');
  return enginePromise;
};

export const cacheMessages = async (userId, roomId, messages) => (await getEngine()).cacheMessages(userId, roomId, messages);
export const getCachedMessages = async (userId, roomId) => (await getEngine()).getCachedMessages(userId, roomId);
export const getCachedMessagesPage = async (userId, roomId, cursor, limit) => (await getEngine()).getCachedMessagesPage(userId, roomId, cursor, limit);
export const getAllCachedMessages = async (userId) => (await getEngine()).getAllCachedMessages(userId);
export const iterateAllCachedMessages = async function* (userId, batchSize = 100) {
  let cursor = null;
  do {
    const page = await (await getEngine()).getAllCachedMessagesPage(userId, cursor, batchSize);
    if (page.items.length) yield page.items;
    cursor = page.nextCursor;
  } while (cursor);
};
export const mergeCachedMessages = async (userId, roomId, messages) => (await getEngine()).mergeCachedMessages(userId, roomId, messages);
export const updateCachedMessage = async (userId, roomId, messageId, patch) => (await getEngine()).updateCachedMessage(userId, roomId, messageId, patch);
export const deleteCachedMessage = async (userId, roomId, messageId) => (await getEngine()).deleteCachedMessage(userId, roomId, messageId);
