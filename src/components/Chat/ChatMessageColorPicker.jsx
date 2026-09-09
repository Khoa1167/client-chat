import { useState } from 'react';
import Button from '../common/Button';
import { toast } from '../common/toastStore';
import { updateChatMessageColor } from '../../api/rooms.api';

function toRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return `${value >> 16}, ${(value >> 8) & 255}, ${value & 255}`;
}

export default function ChatMessageColorPicker({ room, chatMessageColor, onClose }) {
  const [color, setColor] = useState(/^#[0-9a-f]{6}$/i.test(chatMessageColor || '') ? chatMessageColor : '#4338ca');
  const [saving, setSaving] = useState(false);

  const save = async (value) => {
    setSaving(true);
    try {
      await updateChatMessageColor(room._id, value);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không thể đổi màu chữ tin nhắn');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <label className="cursor-pointer flex flex-col items-center gap-3">
        <input type="color" value={color} onChange={event => setColor(event.target.value)} className="sr-only" />
        <span className="w-28 h-20 rounded-xl border-2 border-base-300 shadow-sm flex items-center justify-center font-semibold" style={{ color }}>
          Tin nhắn
        </span>
        <span className="text-xs text-base-content/60">RGB({toRgb(color)})</span>
      </label>
      <div className="flex gap-2">
        <Button size="sm" className="bg-base-200" disabled={saving} onClick={() => save('default')}>Mặc định</Button>
        <Button size="sm" disabled={saving} onClick={() => save(color)}>{saving ? 'Đang lưu...' : 'Áp dụng'}</Button>
      </div>
    </div>
  );
}
