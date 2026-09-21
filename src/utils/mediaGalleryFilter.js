const URL_REGEX = /https?:\/\/[^\s]+/g;

export function filterMediaMessages(messages) {
  return messages.filter(m => !m.isDeleted && m.type === 'image');
}

export function filterFileMessages(messages) {
  return messages.filter(m => !m.isDeleted && (m.type === 'file' || m.type === 'audio'));
}

export function extractLinks(messages) {
  const links = [];
  messages
    .filter(m => !m.isDeleted && m.type === 'text' && m.decryptedText)
    .forEach(m => {
      const matches = m.decryptedText.match(URL_REGEX);
      matches?.forEach(url => links.push({ url, message: m }));
    });
  return links.reverse();
}
