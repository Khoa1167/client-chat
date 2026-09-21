import { useRef, useState } from 'react';
import { Check } from '../icons';
import { toast } from '../common/toastStore';
import { updateChatBackground, uploadChatBackgroundImage } from '../../api/rooms.api';
import { CHAT_BACKGROUNDS } from '../../utils/chatBackgrounds';

export default function ChatBackgroundPicker({ room, chatBackground, chatBackgroundImage, onClose }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const handleSelect = async (key) => {
    if (key === chatBackground && !chatBackgroundImage) return onClose();
    try {
      await updateChatBackground(room._id, key);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không thể đổi nền đoạn chat');
    }
  };

  const handleImageSelect = async (event) => {
    const image = event.target.files?.[0];
    event.target.value = '';
    if (!image) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(image.type) || image.size > 25 * 1024 * 1024) {
      toast.error('Chỉ hỗ trợ JPG, PNG, WebP tối đa 25 MB');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', image);
      await uploadChatBackgroundImage(room._id, formData);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không thể tải ảnh nền');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleImageSelect} />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="mb-4 w-full h-20 rounded-xl border border-dashed border-primary/50 bg-base-200/60 overflow-hidden flex items-center justify-center text-sm font-semibold text-primary disabled:opacity-60"
        style={chatBackgroundImage ? { backgroundImage: `linear-gradient(rgb(0 0 0 / 35%), rgb(0 0 0 / 35%)), url("${chatBackgroundImage}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      >
        <span className={chatBackgroundImage ? 'text-white' : ''}>{uploading ? 'Đang tải ảnh...' : chatBackgroundImage ? 'Đổi ảnh nền' : '+ Tải ảnh nền'}</span>
      </button>
      <div className="grid grid-cols-4 gap-3">
        {CHAT_BACKGROUNDS.map(({ key, label, style }) => (
          <button key={key} type="button" onClick={() => handleSelect(key)} className="flex flex-col items-center gap-1" title={label}>
            <div className="w-12 h-12 rounded-xl border-2 flex items-center justify-center bg-base-200" style={{ ...style, borderColor: key === chatBackground && !chatBackgroundImage ? 'var(--color-primary)' : 'transparent' }}>
              {key === chatBackground && !chatBackgroundImage && <Check className={`w-5 h-5 drop-shadow ${style ? 'text-white' : 'text-primary'}`} />}
            </div>
            <span className="text-[10px] text-base-content/60 truncate w-full text-center">{label}</span>
          </button>
        ))}
      </div>
    </>
  );
}
