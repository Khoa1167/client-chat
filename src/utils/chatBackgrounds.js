// Danh sách nền khung chat (DM lẫn nhóm) — server chỉ lưu key, CSS thật nằm ở đây.
export const CHAT_BACKGROUNDS = [
  { key: 'default', label: 'Mặc định', style: null },
  { key: 'sunset', label: 'Hoàng hôn', style: { background: 'linear-gradient(135deg, #ff9a76, #ff6a88, #ff99ac)' } },
  { key: 'ocean', label: 'Đại dương', style: { background: 'linear-gradient(135deg, #2193b0, #6dd5ed)' } },
  { key: 'forest', label: 'Rừng xanh', style: { background: 'linear-gradient(135deg, #134e5e, #71b280)' } },
  { key: 'lavender', label: 'Oải hương', style: { background: 'linear-gradient(135deg, #a18cd1, #fbc2eb)' } },
  { key: 'midnight', label: 'Nửa đêm', style: { background: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)' } },
  { key: 'mint', label: 'Bạc hà', style: { background: 'linear-gradient(135deg, #43e97b, #38f9d7)' } },
  { key: 'rose', label: 'Hoa hồng', style: { background: 'linear-gradient(135deg, #ff758c, #ff7eb3)' } },
];

export function getChatBackgroundStyle(key, imageUrl) {
  if (imageUrl) {
    return {
      backgroundImage: `linear-gradient(rgb(0 0 0 / 20%), rgb(0 0 0 / 20%)), url("${imageUrl}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  return CHAT_BACKGROUNDS.find(b => b.key === key)?.style || null;
}

export function getChatMessageColor(key) {
  return /^#[0-9a-f]{6}$/i.test(key || '') ? key : undefined;
}
