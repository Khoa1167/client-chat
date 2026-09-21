import { useState, useEffect } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Download01Icon, File01Icon, Link02Icon } from '@hugeicons/core-free-icons';
import { toast } from '../common/toastStore';
import { useAuth } from '../../context/AuthContext';
import useRoomMediaGallery from '../../hooks/chat/useRoomMediaGallery';
import { getDecryptedAttachmentBlob, saveDecryptedBlob, attachmentFileName, attachmentPointer } from '../../utils/attachmentDecrypt';

function GalleryThumb({ message, onSelect }) {
  const { user } = useAuth();
  const [blobUrl, setBlobUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  const canDecrypt = !!(message.__key && attachmentPointer(message));

  useEffect(() => {
    if (!canDecrypt) return undefined;
    let cancelled = false;
    let objectUrl = null;
    getDecryptedAttachmentBlob(message, user._id)
      .then(({ blob }) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [canDecrypt, message, user._id]);

  if (!canDecrypt || failed) {
    return <div className="aspect-square rounded-lg bg-base-200 flex items-center justify-center text-[10px] text-base-content/40">Lỗi</div>;
  }
  if (!blobUrl) {
    return <div className="aspect-square rounded-lg bg-base-200 animate-pulse" />;
  }
  return (
    <button type="button" onClick={() => onSelect(message._id)} className="aspect-square rounded-lg overflow-hidden">
      <img src={blobUrl} alt="" className="w-full h-full object-cover" />
    </button>
  );
}

function FileRow({ message, onSelect }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const pointer = attachmentPointer(message);
  const fileName = attachmentFileName(message, pointer);

  const handleDownload = async (e) => {
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    try {
      const { blob } = await getDecryptedAttachmentBlob(message, user._id);
      await saveDecryptedBlob(blob, fileName);
      toast.success('Đã tải xuống');
    } catch (err) {
      console.error('[E2EE] Tải file thất bại:', err);
      toast.error('Không thể tải file');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button type="button" onClick={() => onSelect(message._id)} className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-base-200 text-left">
      <HugeiconsIcon icon={File01Icon} size={20} className="flex-shrink-0 text-base-content/50" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold truncate">{fileName}</div>
        <div className="text-[10px] text-base-content/40">{new Date(message.createdAt).toLocaleDateString('vi-VN')}</div>
      </div>
      <button type="button" onClick={handleDownload} disabled={loading} className="flex-shrink-0 p-1.5 rounded-full hover:bg-base-300">
        <HugeiconsIcon icon={Download01Icon} size={16} />
      </button>
    </button>
  );
}

function LinkRow({ item, onSelect }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-base-200">
      <HugeiconsIcon icon={Link02Icon} size={18} className="flex-shrink-0 text-base-content/50" />
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 text-xs text-primary hover:underline truncate">
        {item.url}
      </a>
      <button type="button" onClick={() => onSelect(item.message._id)} className="flex-shrink-0 text-[10px] text-base-content/40 hover:text-base-content">
        Xem
      </button>
    </div>
  );
}

export default function MediaGalleryTab({ room, active, onSelectMessage }) {
  const { user } = useAuth();
  const [subTab, setSubTab] = useState('media');
  const { mediaMessages, fileMessages, linkItems, loading } = useRoomMediaGallery(room, user, active);

  return (
    <div className="w-full flex flex-col gap-3">
      <div className="tabs tabs-boxed tabs-xs bg-base-200/50 w-full">
        <a className={`tab ${subTab === 'media' ? 'tab-active' : ''}`} onClick={() => setSubTab('media')}>
          Ảnh ({mediaMessages.length})
        </a>
        <a className={`tab ${subTab === 'files' ? 'tab-active' : ''}`} onClick={() => setSubTab('files')}>
          Tệp ({fileMessages.length})
        </a>
        <a className={`tab ${subTab === 'links' ? 'tab-active' : ''}`} onClick={() => setSubTab('links')}>
          Liên kết ({linkItems.length})
        </a>
      </div>

      {loading && <div className="text-xs text-base-content/40 text-center py-2">Đang tải...</div>}

      {!loading && subTab === 'media' && (
        mediaMessages.length === 0 ? (
          <div className="text-xs text-base-content/40 text-center py-6">Chưa có ảnh nào</div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 max-h-96 overflow-y-auto">
            {mediaMessages.map(m => <GalleryThumb key={m._id} message={m} onSelect={onSelectMessage} />)}
          </div>
        )
      )}

      {!loading && subTab === 'files' && (
        fileMessages.length === 0 ? (
          <div className="text-xs text-base-content/40 text-center py-6">Chưa có tệp nào</div>
        ) : (
          <div className="flex flex-col gap-1 max-h-96 overflow-y-auto">
            {fileMessages.map(m => <FileRow key={m._id} message={m} onSelect={onSelectMessage} />)}
          </div>
        )
      )}

      {!loading && subTab === 'links' && (
        linkItems.length === 0 ? (
          <div className="text-xs text-base-content/40 text-center py-6">Chưa có liên kết nào</div>
        ) : (
          <div className="flex flex-col gap-1 max-h-96 overflow-y-auto">
            {linkItems.map((item, i) => <LinkRow key={`${item.message._id}-${i}`} item={item} onSelect={onSelectMessage} />)}
          </div>
        )
      )}
    </div>
  );
}
