import { CapacitorSQLite } from '@capacitor-community/sqlite';
import { Preferences } from '@capacitor/preferences';

const DB_NAME = 'chat_messages';
const KEY_NAME = 'sqlite_encryption_key';
const cacheId = (userId, roomId, messageId) => `${userId}:${roomId}:${messageId}`;
let databasePromise;

const getOrCreateEncryptionKey = async () => {
  const { value } = await Preferences.get({ key: KEY_NAME });
  if (value) return value;

  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const key = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  await Preferences.set({ key: KEY_NAME, value: key });
  return key;
};

const openDatabase = async () => {
  const key = await getOrCreateEncryptionKey();
  const secret = await CapacitorSQLite.isSecretStored();
  if (!secret.result) {
    await CapacitorSQLite.setEncryptionSecret({ passphrase: key });
  } else if (!(await CapacitorSQLite.checkEncryptionSecret({ passphrase: key })).result) {
    throw new Error('Không thể mở bộ nhớ tin nhắn được mã hóa trên thiết bị này');
  }

  const exists = await CapacitorSQLite.isDatabase({ database: DB_NAME });
  await CapacitorSQLite.createConnection({
    database: DB_NAME,
    encrypted: true,
    mode: exists.result ? 'secret' : 'encryption',
    version: 1,
  });
  await CapacitorSQLite.open({ database: DB_NAME });
  await CapacitorSQLite.execute({
    database: DB_NAME,
    statements: `
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        room_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        message TEXT NOT NULL
      );
      DROP INDEX IF EXISTS idx_messages_user_room;
      CREATE INDEX IF NOT EXISTS idx_messages_page
        ON messages(user_id, room_id, created_at DESC, id DESC);
    `,
  });
  return CapacitorSQLite;
};

const getDatabase = () => {
  databasePromise ??= openDatabase().catch(error => {
    databasePromise = undefined;
    throw error;
  });
  return databasePromise;
};

const cacheableMessage = message => Object.fromEntries(Object.entries(message).filter(([key]) => key !== '__key'));

export const cacheMessages = async (userId, roomId, messages) => {
  const database = await getDatabase();
  const set = messages.filter(message => message?._id).map(message => ({
    statement: 'INSERT OR REPLACE INTO messages (id, user_id, room_id, created_at, message) VALUES (?, ?, ?, ?, ?)',
    values: [
      cacheId(userId, roomId, message._id),
      userId,
      roomId,
      message.createdAt || new Date().toISOString(),
      JSON.stringify(cacheableMessage(message)),
    ],
  }));
  if (set.length) await database.executeSet({ database: DB_NAME, set });
};

export const getCachedMessages = async (userId, roomId) => {
  const database = await getDatabase();
  const result = await database.query({
    database: DB_NAME,
    statement: 'SELECT message FROM messages WHERE user_id = ? AND room_id = ? ORDER BY created_at ASC',
    values: [userId, roomId],
  });
  return (result.values || []).map(row => JSON.parse(row.message));
};

export const getCachedMessagesPage = async (userId, roomId, cursor, limit = 50) => {
  const database = await getDatabase();
  const pageSize = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const cursorClause = cursor ? ' AND (created_at < ? OR (created_at = ? AND id < ?))' : '';
  const values = cursor
    ? [userId, roomId, cursor.createdAt, cursor.createdAt, cursor.id, pageSize + 1]
    : [userId, roomId, pageSize + 1];
  const result = await database.query({
    database: DB_NAME,
    statement: `SELECT id, created_at, message FROM messages WHERE user_id = ? AND room_id = ?${cursorClause} ORDER BY created_at DESC, id DESC LIMIT ?`,
    values,
  });
  const records = result.values || [];
  const page = records.slice(0, pageSize);
  const oldest = page.at(-1);
  return {
    items: page.reverse().map(row => JSON.parse(row.message)),
    hasMore: records.length > pageSize,
    nextCursor: records.length > pageSize && oldest ? { createdAt: oldest.created_at, id: oldest.id } : null,
  };
};

export const getAllCachedMessages = async (userId) => {
  const database = await getDatabase();
  const result = await database.query({
    database: DB_NAME,
    statement: 'SELECT message FROM messages WHERE user_id = ? ORDER BY created_at ASC',
    values: [userId],
  });
  return (result.values || []).map(row => JSON.parse(row.message));
};

export const getAllCachedMessagesPage = async (userId, cursor, limit = 100) => {
  const database = await getDatabase();
  const pageSize = Math.min(Math.max(Number(limit) || 100, 1), 100);
  const result = await database.query({
    database: DB_NAME,
    statement: `SELECT id, message FROM messages WHERE user_id = ?${cursor ? ' AND id > ?' : ''} ORDER BY id ASC LIMIT ?`,
    values: cursor ? [userId, cursor.id, pageSize] : [userId, pageSize],
  });
  const records = result.values || [];
  const last = records.at(-1);
  return {
    items: records.map(row => JSON.parse(row.message)),
    nextCursor: records.length === pageSize && last ? { id: last.id } : null,
  };
};

export const mergeCachedMessages = async (userId, roomId, messages) => {
  const valid = messages.filter(message => message?._id);
  if (!valid.length) return;
  const database = await getDatabase();
  const ids = valid.map(message => cacheId(userId, roomId, message._id));
  const existing = await database.query({
    database: DB_NAME,
    statement: `SELECT id, message FROM messages WHERE id IN (${ids.map(() => '?').join(',')})`,
    values: ids,
  });
  const current = new Map((existing.values || []).map(row => [row.id, JSON.parse(row.message)]));
  const set = valid
    .filter(message => {
      const previous = current.get(cacheId(userId, roomId, message._id));
      return !previous || new Date(previous.updatedAt || previous.createdAt) <= new Date(message.updatedAt || message.createdAt);
    })
    .map(message => ({
      statement: 'INSERT OR REPLACE INTO messages (id, user_id, room_id, created_at, message) VALUES (?, ?, ?, ?, ?)',
      values: [cacheId(userId, roomId, message._id), userId, roomId, message.createdAt || new Date().toISOString(), JSON.stringify(cacheableMessage(message))],
    }));
  if (set.length) await database.executeSet({ database: DB_NAME, set });
};

export const updateCachedMessage = async (userId, roomId, messageId, patch) => {
  const database = await getDatabase();
  const id = cacheId(userId, roomId, messageId);
  const result = await database.query({
    database: DB_NAME,
    statement: 'SELECT message FROM messages WHERE id = ? AND user_id = ? AND room_id = ?',
    values: [id, userId, roomId],
  });
  if (!result.values?.[0]) return;

  const message = { ...JSON.parse(result.values[0].message), ...patch };
  await database.run({
    database: DB_NAME,
    statement: 'UPDATE messages SET message = ? WHERE id = ? AND user_id = ? AND room_id = ?',
    values: [JSON.stringify(cacheableMessage(message)), id, userId, roomId],
  });
};

export const deleteCachedMessage = async (userId, roomId, messageId) => {
  const database = await getDatabase();
  await database.run({
    database: DB_NAME,
    statement: 'DELETE FROM messages WHERE id = ? AND user_id = ? AND room_id = ?',
    values: [cacheId(userId, roomId, messageId), userId, roomId],
  });
};
