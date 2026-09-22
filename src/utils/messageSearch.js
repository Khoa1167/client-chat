import { endOfDay, isValid, parseISO, startOfDay } from 'date-fns';

const ATTACHMENT_TYPES = new Set(['image', 'audio', 'file']);

export const hasActiveSearchFilters = ({ senderId, startDate, endDate, type, hasAttachment } = {}) =>
  Boolean(senderId || startDate || endDate || type || hasAttachment);

const dateBoundary = (value, end) => {
  if (!value) return null;
  const date = parseISO(value);
  if (!isValid(date)) return null;
  return end ? endOfDay(date) : startOfDay(date);
};

export const searchMessages = (messages, query, filters = {}) => {
  const normalizedQuery = query?.trim().toLocaleLowerCase('vi-VN') || '';
  if (!normalizedQuery && !hasActiveSearchFilters(filters)) return [];

  const { senderId, startDate, endDate, type, hasAttachment } = filters;
  const start = dateBoundary(startDate, false);
  const end = dateBoundary(endDate, true);

  return messages.filter(msg => {
    if (msg.isDeleted) return false;

    if (normalizedQuery) {
      if (typeof msg.decryptedText !== 'string') return false;
      if (!msg.decryptedText.toLocaleLowerCase('vi-VN').includes(normalizedQuery)) return false;
    }

    const messageSenderId = (msg.sender?._id || msg.sender)?.toString();
    if (senderId && messageSenderId !== senderId) return false;
    if (type && msg.type !== type) return false;
    if (hasAttachment && !ATTACHMENT_TYPES.has(msg.type)) return false;

    if (start || end) {
      const createdAt = new Date(msg.createdAt);
      if (!isValid(createdAt)) return false;
      if (start && createdAt < start) return false;
      if (end && createdAt > end) return false;
    }

    return true;
  });
};

export const getMessageSnippet = (text, query, length = 60) => {
  if (typeof text !== 'string') return '';
  const normalizedQuery = query?.trim().toLocaleLowerCase('vi-VN') || '';
  if (!normalizedQuery) return text.length > length ? `${text.substring(0, length)}...` : text;

  const idx = text.toLocaleLowerCase('vi-VN').indexOf(normalizedQuery);
  if (idx === -1) return text.length > length ? `${text.substring(0, length)}...` : text;

  const start = Math.max(0, idx - 20);
  const end = Math.min(text.length, idx + normalizedQuery.length + 40);
  const snippet = text.substring(start, end);
  return (start > 0 ? '...' : '') + snippet + (end < text.length ? '...' : '');
};
