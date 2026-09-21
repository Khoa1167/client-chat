export const searchMessages = (messages, query, filters = {}) => {
  if (!query?.trim()) return [];

  const queryLower = query.toLowerCase();
  const { senderId, startDate, endDate, type } = filters;

  return messages.filter(msg => {
    if (!msg.decryptedText) return false;
    if (msg.isDeleted) return false;

    const textMatch = msg.decryptedText.toLowerCase().includes(queryLower);
    if (!textMatch) return false;

    if (senderId && msg.sender?._id?.toString() !== senderId) return false;
    if (type && msg.type !== type) return false;

    if (startDate || endDate) {
      const createdAt = new Date(msg.createdAt);
      if (startDate && createdAt < new Date(startDate)) return false;
      if (endDate && createdAt > new Date(endDate)) return false;
    }

    return true;
  });
};

export const getMessageSnippet = (text, query, length = 60) => {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text.substring(0, length) + '...';

  const start = Math.max(0, idx - 20);
  const end = Math.min(text.length, idx + query.length + 40);
  const snippet = text.substring(start, end);
  return (start > 0 ? '...' : '') + snippet + (end < text.length ? '...' : '');
};
