const DB_NAME = 'ChatAppMessages';
const STORE_NAME = 'messages';

const openDB = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 5);
  request.onupgradeneeded = () => {
    const db = request.result;
    const store = db.objectStoreNames.contains(STORE_NAME)
      ? request.transaction.objectStore(STORE_NAME)
      : db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    if (!store.indexNames.contains('byUserRoom')) store.createIndex('byUserRoom', ['userId', 'roomId']);
    if (!store.indexNames.contains('byUser')) store.createIndex('byUser', 'userId');
    if (!store.indexNames.contains('byUserId')) store.createIndex('byUserId', ['userId', 'id']);
    if (!store.indexNames.contains('byUserRoomCreatedId')) {
      store.createIndex('byUserRoomCreatedId', ['userId', 'roomId', 'createdAt', 'id']);
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const cacheId = (userId, roomId, messageId) => `${userId}:${roomId}:${messageId}`;

export const cacheMessages = async (userId, roomId, messages) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    messages.forEach(message => {
      if (!message?._id) return;
      const cachedMessage = Object.fromEntries(Object.entries(message).filter(([key]) => key !== '__key'));
      store.put({
        id: cacheId(userId, roomId, message._id),
        userId,
        roomId,
        createdAt: message.createdAt || new Date().toISOString(),
        message: cachedMessage,
      });
    });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
};

export const getCachedMessages = async (userId, roomId) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).index('byUserRoom').getAll(IDBKeyRange.only([userId, roomId]));
    request.onsuccess = () => {
      db.close();
      resolve(request.result.map(record => record.message).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)));
    };
    request.onerror = () => { db.close(); reject(request.error); };
  });
};

export const getCachedMessagesPage = async (userId, roomId, cursor, limit = 50) => {
  const db = await openDB();
  const pageSize = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const lower = [userId, roomId, '', ''];
  const upper = cursor
    ? [userId, roomId, cursor.createdAt, cursor.id]
    : [userId, roomId, '\uffff', '\uffff'];
  const range = IDBKeyRange.bound(lower, upper, false, Boolean(cursor));

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).index('byUserRoomCreatedId').openCursor(range, 'prev');
    const records = [];
    request.onsuccess = () => {
      const current = request.result;
      if (current && records.length <= pageSize) {
        records.push(current.value);
        current.continue();
        return;
      }
      db.close();
      const page = records.slice(0, pageSize);
      const oldest = page.at(-1);
      resolve({
        items: page.reverse().map(record => record.message),
        hasMore: records.length > pageSize,
        nextCursor: records.length > pageSize && oldest ? { createdAt: oldest.createdAt, id: oldest.id } : null,
      });
    };
    request.onerror = () => { db.close(); reject(request.error); };
  });
};

export const getAllCachedMessages = async (userId) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).index('byUser').getAll(IDBKeyRange.only(userId));
    request.onsuccess = () => {
      db.close();
      resolve(request.result.map(record => record.message));
    };
    request.onerror = () => { db.close(); reject(request.error); };
  });
};

export const getAllCachedMessagesPage = async (userId, cursor, limit = 100) => {
  const db = await openDB();
  const pageSize = Math.min(Math.max(Number(limit) || 100, 1), 100);
  const lower = cursor ? [userId, cursor.id] : [userId, ''];
  const range = IDBKeyRange.bound(lower, [userId, '\uffff'], Boolean(cursor), false);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).index('byUserId').openCursor(range);
    const records = [];
    request.onsuccess = () => {
      const current = request.result;
      if (current && records.length < pageSize) {
        records.push(current.value);
        current.continue();
        return;
      }
      db.close();
      const last = records.at(-1);
      resolve({
        items: records.map(record => record.message),
        nextCursor: records.length === pageSize && last ? { id: last.id } : null,
      });
    };
    request.onerror = () => { db.close(); reject(request.error); };
  });
};

export const mergeCachedMessages = async (userId, roomId, messages) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    messages.forEach(message => {
      if (!message?._id) return;
      const request = store.get(cacheId(userId, roomId, message._id));
      request.onsuccess = () => {
        const existing = request.result?.message;
        if (existing && new Date(existing.updatedAt || existing.createdAt) > new Date(message.updatedAt || message.createdAt)) return;
        store.put({
          id: cacheId(userId, roomId, message._id), userId, roomId,
          createdAt: message.createdAt || new Date().toISOString(),
          message: Object.fromEntries(Object.entries(message).filter(([key]) => key !== '__key')),
        });
      };
    });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
};

export const updateCachedMessage = async (userId, roomId, messageId, patch) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(cacheId(userId, roomId, messageId));
    request.onsuccess = () => {
      if (request.result) store.put({ ...request.result, message: { ...request.result.message, ...patch } });
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
};

export const deleteCachedMessage = async (userId, roomId, messageId) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(cacheId(userId, roomId, messageId));
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
};
